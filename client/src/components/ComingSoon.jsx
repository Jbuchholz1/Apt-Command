import { Link } from 'react-router-dom';

export default function ComingSoon({ title = 'Module' }) {
  return (
    <div className="coming-soon-page">
      <div className="coming-soon-icon">{'\u{1F6A7}'}</div>
      <h1 className="coming-soon-title">{title}</h1>
      <p className="coming-soon-text">This module is under development and will be available soon.</p>
      <Link to="/" className="coming-soon-back">&larr; Back to Home</Link>
    </div>
  );
}
