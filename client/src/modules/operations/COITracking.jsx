import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function COITracking() {
  return (
    <div className="operations-module">
      <div className="ops-toolbar">
        <div className="ops-toolbar-left">
          <Link to="/operations" className="ops-back-btn"><ArrowLeft size={14} /> Operations</Link>
          <img src="/apt-logo.jpg" alt="APT" className="ops-toolbar-logo" />
          <h1 className="ops-toolbar-title">COI Tracking</h1>
        </div>
      </div>

      <div className="ops-coming-soon">
        <div className="ops-coming-soon-icon">{'\u{1F6A7}'}</div>
        <h2 className="ops-coming-soon-title">COI Tracking</h2>
        <p className="ops-coming-soon-text">
          This section is under development. Track Certificates of Insurance for placements and clients here soon.
        </p>
      </div>
    </div>
  );
}
