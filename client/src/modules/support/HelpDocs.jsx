import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, ArrowLeft, ExternalLink, Search } from 'lucide-react';
import { PLAYBOOKS, FAQ_SECTIONS, TRAINING_VIDEOS } from './lib/supportData';

export default function HelpDocs() {
  const [openItems, setOpenItems] = useState({});
  const [search, setSearch] = useState('');

  const toggle = (key) => {
    setOpenItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const filtered = search.trim()
    ? FAQ_SECTIONS.map(section => ({
        ...section,
        items: section.items.filter(item =>
          item.question.toLowerCase().includes(search.toLowerCase()) ||
          item.answer.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter(section => section.items.length > 0)
    : FAQ_SECTIONS;

  return (
    <div className="support-page">
      <div className="support-toolbar">
        <Link to="/support" className="support-back-btn"><ArrowLeft size={16} /> Support</Link>
        <h2 className="support-toolbar-title">Help & Documentation</h2>
      </div>

      <div className="support-page-body">
        {/* Search */}
        <div className="support-search-wrap">
          <Search size={16} className="support-search-icon" />
          <input
            type="text"
            className="support-search"
            placeholder="Search FAQs..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Playbooks */}
        <div className="playbooks-section">
          <h3 className="faq-section-title">Playbooks</h3>
          <div className="playbooks-list">
            {PLAYBOOKS.map((pb, idx) => (
              pb.url ? (
                <a key={idx} href={pb.url} target="_blank" rel="noopener noreferrer" className="playbook-link">
                  <ExternalLink size={14} />
                  <span>{pb.title}</span>
                </a>
              ) : (
                <span key={idx} className="playbook-link placeholder">
                  <ExternalLink size={14} />
                  <span>{pb.title}</span>
                </span>
              )
            ))}
          </div>
        </div>

        {/* FAQ Sections */}
        {filtered.length === 0 && (
          <p className="support-empty">No FAQs match your search.</p>
        )}

        {filtered.map(section => (
          <div key={section.module} className="faq-section">
            <h3 className="faq-section-title">{section.module}</h3>
            {section.items.map((item, idx) => {
              const key = `${section.module}-${idx}`;
              const isOpen = openItems[key];
              return (
                <div key={key} className={`faq-item ${isOpen ? 'open' : ''}`}>
                  <button className="faq-question" onClick={() => toggle(key)}>
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <span>{item.question}</span>
                  </button>
                  {isOpen && (
                    <div className="faq-answer">{item.answer}</div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {/* Training Videos */}
        {TRAINING_VIDEOS.some(v => v.url) && (
          <div className="training-section">
            <h3 className="faq-section-title">Training Videos</h3>
            <div className="training-list">
              {TRAINING_VIDEOS.filter(v => v.url).map((video, idx) => (
                <a
                  key={idx}
                  href={video.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="training-card"
                >
                  <div className="training-card-body">
                    <span className="training-card-module">{video.module}</span>
                    <h4 className="training-card-title">{video.title}</h4>
                    <p className="training-card-desc">{video.description}</p>
                  </div>
                  <ExternalLink size={14} className="training-card-link-icon" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
