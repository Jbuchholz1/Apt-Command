/**
 * Static content for the Support module.
 * FAQ sections, training links, IT contact info, escalation path.
 */

export const PLAYBOOKS = [
  { title: 'Sales', url: '', description: 'Sales playbook and processes' },
  { title: 'Delivery', url: '', description: 'Delivery playbook and processes' },
  { title: 'Operations', url: '', description: 'Operations playbook and processes' },
];

export const FAQ_SECTIONS = [
  {
    module: 'Req Board',
    items: [
      {
        question: 'How do I filter the Req Board?',
        answer: 'Use the filter bar at the top of the Req Board. You can filter by Status, Employment Type, Owner/Recruiter, Client, and Remote (Yes/No/Hybrid). Multiple filters can be combined. Click "Clear All" to reset.',
      },
      {
        question: 'How do I edit a job field?',
        answer: 'Click on an editable cell (like TR, Status, Type, or Remote) to edit it inline. Changes to Bullhorn fields are saved directly to Bullhorn. Changes to override fields (like 48hr notes) are saved locally.',
      },
      {
        question: 'What do the status colors mean?',
        answer: 'Green = Accepting Candidates, Blue = Covered, Orange = Offer Out, Purple = Placed, Teal = Filled, Red = Lost, Gray = Wash, Dark Gray = Archive.',
      },
      {
        question: 'Why did a job disappear from the board?',
        answer: 'Jobs with statuses like Filled, Placed, Lost, or Archive automatically fall off the main board 24 hours after their status change. They are still counted in the stats and visible in the "On The Board" modal.',
      },
      {
        question: 'How do I export the Req Board to Excel?',
        answer: 'Click the Excel export button in the toolbar. It exports the currently visible (filtered) jobs to an .xlsx file.',
      },
    ],
  },
  {
    module: 'Reporting',
    items: [
      {
        question: 'How do I change the date range?',
        answer: 'Use the date pickers in the navy toolbar bar. You can type dates manually or use the preset buttons (This Week, This Month, This Quarter, etc.).',
      },
      {
        question: 'What are the recruiter tiers?',
        answer: 'Recruiters are categorized by tier based on their tenure and goals. Each tier has different targets for submissions, interviews, placements, and spread. Your tier determines your goal thresholds on the dashboard.',
      },
      {
        question: 'How is Spread calculated?',
        answer: 'Spread is calculated from Bullhorn Placement records within the selected date range. It sums the gross margin (bill rate minus pay rate, times hours) for each placement, with split credit applied based on commission records.',
      },
    ],
  },
  {
    module: 'Pipeline',
    items: [
      {
        question: 'What is the Pipeline tab?',
        answer: 'The Pipeline tab shows Bullhorn Opportunities — potential new business leads. You can filter by status, owner, and sort by various fields.',
      },
      {
        question: 'How do I update an opportunity status?',
        answer: 'Click the status cell on any opportunity row to edit it inline. The change is saved directly to Bullhorn.',
      },
    ],
  },
  {
    module: 'APT Health',
    items: [
      {
        question: 'What do the health gauges measure?',
        answer: 'The gauges track key performance indicators: MAR Total, Input metrics, Fill Ratio, Backout %, and Checkin Completion. Each gauge compares current performance against targets.',
      },
      {
        question: 'What do the green/yellow/red dots mean?',
        answer: 'Green = client is healthy (meeting activity and performance thresholds). Yellow = needs attention. Red = at risk (low activity or poor metrics). The thresholds are based on active placements and recent activity counts.',
      },
    ],
  },
  {
    module: 'Org Flow',
    items: [
      {
        question: 'How do I add employees to a client org chart?',
        answer: 'Open a client card, then click "Add Employee" to create a new employee node. You can drag and drop employees to reposition them in the org chart.',
      },
      {
        question: 'What are Apt Allies?',
        answer: 'Apt Allies are active placements (contractors) at a client. The count comes from Bullhorn and updates automatically. Click the number to see the full list with candidate names and job details.',
      },
    ],
  },
  {
    module: 'Performance',
    items: [
      {
        question: 'Can I view another team member\'s dashboard?',
        answer: 'Yes — if you are a manager or admin, you can select another team member from the dropdown to view their individual performance metrics.',
      },
      {
        question: 'Why don\'t my numbers match the team dashboard?',
        answer: 'The individual dashboard filters all data to your specific user ID. If you are part of split-credit placements, both dashboards should reflect your share. Check the date range to make sure it matches.',
      },
    ],
  },
  {
    module: 'Operations',
    items: [
      {
        question: 'Who can access Operations?',
        answer: 'The Operations tab is restricted to admin users only. It tracks placement onboarding checklists (paperwork, healthcare, 401k, etc.).',
      },
      {
        question: 'How do I update a placement checklist?',
        answer: 'Click checkboxes or date fields inline to update them. Changes are saved to the database and shared across the team. Rows turn green when all items are checked.',
      },
    ],
  },
  {
    module: 'General',
    items: [
      {
        question: 'How often does data refresh?',
        answer: 'Most modules auto-refresh every 5 minutes. You can also click the refresh button in any toolbar to get the latest data immediately.',
      },
      {
        question: 'Why am I seeing an error?',
        answer: 'Errors usually mean the Bullhorn API or MCP server is temporarily unavailable. Try refreshing the page. If the issue persists, check the System Status page or contact IT support.',
      },
      {
        question: 'How do I log out?',
        answer: 'Click the logout button in the bottom of the sidebar (the door icon next to your name).',
      },
    ],
  },
];

export const TRAINING_VIDEOS = [
  {
    title: 'APT Command Overview',
    module: 'General',
    url: '',
    description: 'A quick walkthrough of the entire APT Command platform — navigation, key modules, and how to get started.',
  },
  {
    title: 'Req Board Deep Dive',
    module: 'Req Board',
    url: '',
    description: 'How to use the Req Board — filtering, inline editing, exporting, and reading status badges.',
  },
  {
    title: 'Recruiter Dashboard Walkthrough',
    module: 'Reporting',
    url: '',
    description: 'Understanding the Recruiter Dashboard — KPI metrics, goal tracking, and charts.',
  },
];

export const IT_CONTACT = {
  email: 'support@aptcompanies.com',
  phone: '',
  teamsChannel: '',
  hours: 'Monday – Friday, 8:00 AM – 5:00 PM CT',
};

export const ESCALATION_PATH = [
  {
    level: 1,
    title: 'Submit a Ticket',
    description: 'Use the Bug & Feedback form or the IT Support quick ticket form. Your request will be logged and tracked.',
  },
  {
    level: 2,
    title: 'Contact IT Directly',
    description: 'If your issue is urgent or blocking your work, email or message IT support directly using the contact info above.',
  },
  {
    level: 3,
    title: 'Escalate to Management',
    description: 'For critical system-wide issues or if you haven\'t received a response, escalate to your manager who can contact the development team.',
  },
];
