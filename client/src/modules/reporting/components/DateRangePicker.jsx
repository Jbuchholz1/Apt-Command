import { toLocalYMD } from '../../../lib/localDate';

export default function DateRangePicker({ startDate, endDate, onStartChange, onEndChange }) {
  const today = new Date();

  const getSunday = (d) => {
    const date = new Date(d);
    const day = date.getDay();
    date.setDate(date.getDate() - day);
    return date;
  };

  const toISO = toLocalYMD;

  const setThisWeek = () => {
    const sun = getSunday(today);
    const sat = new Date(sun);
    sat.setDate(sun.getDate() + 6);
    onStartChange(toISO(sun));
    onEndChange(toISO(sat));
  };

  const setLastWeek = () => {
    const sun = getSunday(today);
    sun.setDate(sun.getDate() - 7);
    const sat = new Date(sun);
    sat.setDate(sun.getDate() + 6);
    onStartChange(toISO(sun));
    onEndChange(toISO(sat));
  };

  const setThisMonth = () => {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    onStartChange(toISO(first));
    onEndChange(toISO(last));
  };

  return (
    <div className="date-range-picker">
      <div className="date-inputs">
        <label>
          <span className="date-label">From</span>
          <input type="date" value={startDate} onChange={e => onStartChange(e.target.value)} />
        </label>
        <label>
          <span className="date-label">To</span>
          <input type="date" value={endDate} onChange={e => onEndChange(e.target.value)} />
        </label>
      </div>
      <div className="date-presets">
        <button onClick={setThisWeek}>This Week</button>
        <button onClick={setLastWeek}>Last Week</button>
        <button onClick={setThisMonth}>This Month</button>
      </div>
    </div>
  );
}
