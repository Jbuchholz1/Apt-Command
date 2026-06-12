// Orchestrator for the nightly SharePoint export.
//
// Builds three Excel workbooks (Req Board, Org Flow, Pipeline) in parallel,
// uploads each to the configured SharePoint folder, and reports per-file
// status. One file's failure does not block the other two.

const {
  buildReqBoardWorkbook,
  buildOrgFlowWorkbook,
  buildPipelineWorkbook,
} = require('./exporters');
const { uploadFile } = require('./sharepoint');

const RETRY_DELAY_MS = 3000;

function todayInChicago() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(new Date()); // YYYY-MM-DD
}

async function uploadWithRetry(folderPath, filename, buffer) {
  try {
    return await uploadFile(folderPath, filename, buffer);
  } catch (firstErr) {
    await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    try {
      return await uploadFile(folderPath, filename, buffer);
    } catch (secondErr) {
      const e = new Error(`Upload failed twice: ${secondErr.message}`);
      e.firstError = firstErr.message;
      throw e;
    }
  }
}

async function runOne(name, filename, buildFn, folderPath) {
  const buffer = await buildFn();
  const result = await uploadWithRetry(folderPath, filename, buffer);
  return { name, filename, status: 'ok', webUrl: result.webUrl };
}

// In-process guard so the nightly cron and the admin "run now" button can't run
// the export concurrently (duplicate SharePoint uploads / wasted Bullhorn load).
// NOTE: per-process only — it does NOT protect against two Railway replicas both
// firing the cron; that needs a shared lock (tracked under multi-instance work).
let exportInProgress = false;

async function runNightlyExport() {
  const folder = process.env.SHAREPOINT_FOLDER_PATH;
  if (!folder) throw new Error('runNightlyExport requires SHAREPOINT_FOLDER_PATH');

  if (exportInProgress) {
    console.warn('[scheduledExport] run skipped — an export is already in progress');
    return [{ name: 'all', status: 'skipped', error: 'export already in progress' }];
  }
  exportInProgress = true;
  try {
    const ymd = todayInChicago();
    const tasks = [
      { name: 'Req Board', filename: `APT_Req_Board_${ymd}.xlsx`, build: buildReqBoardWorkbook },
      { name: 'Org Flow', filename: `APT_Org_Flow_${ymd}.xlsx`, build: buildOrgFlowWorkbook },
      { name: 'Pipeline', filename: `APT_Pipeline_${ymd}.xlsx`, build: buildPipelineWorkbook },
    ];

    const settled = await Promise.allSettled(
      tasks.map(t => runOne(t.name, t.filename, t.build, folder))
    );

    return settled.map((s, i) => {
      if (s.status === 'fulfilled') return s.value;
      return { name: tasks[i].name, filename: tasks[i].filename, status: 'fail', error: s.reason?.message || String(s.reason) };
    });
  } finally {
    exportInProgress = false;
  }
}

module.exports = { runNightlyExport };
