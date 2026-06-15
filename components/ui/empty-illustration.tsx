'use client';

import { motion } from 'framer-motion';

type IllustrationType = 'chat' | 'contacts' | 'campaigns' | 'knowledge' | 'crm' | 'search' | 'calendar' | 'media';

interface EmptyIllustrationProps {
  type: IllustrationType;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/* ── SVG illustrations ──────────────────────────────────────────────────── */

function ChatIllustration() {
  return (
    <svg width="120" height="100" viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Main bubble */}
      <rect x="8" y="10" width="80" height="52" rx="14" fill="#e8622a" fillOpacity="0.12" stroke="#e8622a" strokeOpacity="0.3" strokeWidth="1.5" />
      {/* Tail */}
      <path d="M22 62 L12 76 L36 68Z" fill="#e8622a" fillOpacity="0.12" stroke="#e8622a" strokeOpacity="0.3" strokeWidth="1.5" strokeLinejoin="round" />
      {/* Lines inside bubble */}
      <rect x="20" y="24" width="48" height="5" rx="2.5" fill="#e8622a" fillOpacity="0.35" />
      <rect x="20" y="34" width="36" height="5" rx="2.5" fill="#e8622a" fillOpacity="0.25" />
      <rect x="20" y="44" width="42" height="5" rx="2.5" fill="#e8622a" fillOpacity="0.2" />
      {/* Small reply bubble */}
      <rect x="52" y="56" width="58" height="30" rx="10" fill="#0f1e38" fillOpacity="0.08" stroke="#0f1e38" strokeOpacity="0.15" strokeWidth="1.5" />
      <rect x="62" y="65" width="30" height="4" rx="2" fill="#0f1e38" fillOpacity="0.25" />
      <rect x="62" y="73" width="22" height="4" rx="2" fill="#0f1e38" fillOpacity="0.18" />
      {/* WhatsApp dots */}
      <circle cx="106" cy="16" r="3" fill="#25D366" fillOpacity="0.7" />
      <circle cx="114" cy="10" r="2" fill="#25D366" fillOpacity="0.4" />
    </svg>
  );
}

function ContactsIllustration() {
  return (
    <svg width="120" height="100" viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Center person */}
      <circle cx="60" cy="32" r="18" fill="#e8622a" fillOpacity="0.12" stroke="#e8622a" strokeOpacity="0.3" strokeWidth="1.5" />
      <circle cx="60" cy="26" r="8" fill="#e8622a" fillOpacity="0.3" />
      <path d="M44 52c0-8.84 7.16-16 16-16s16 7.16 16 16" stroke="#e8622a" strokeOpacity="0.3" strokeWidth="2" strokeLinecap="round" />
      {/* Left person */}
      <circle cx="24" cy="42" r="13" fill="#0f1e38" fillOpacity="0.07" stroke="#0f1e38" strokeOpacity="0.15" strokeWidth="1.5" />
      <circle cx="24" cy="37" r="6" fill="#0f1e38" fillOpacity="0.2" />
      <path d="M12 58c0-6.63 5.37-12 12-12s12 5.37 12 12" stroke="#0f1e38" strokeOpacity="0.15" strokeWidth="1.5" strokeLinecap="round" />
      {/* Right person */}
      <circle cx="96" cy="42" r="13" fill="#0f1e38" fillOpacity="0.07" stroke="#0f1e38" strokeOpacity="0.15" strokeWidth="1.5" />
      <circle cx="96" cy="37" r="6" fill="#0f1e38" fillOpacity="0.2" />
      <path d="M84 58c0-6.63 5.37-12 12-12s12 5.37 12 12" stroke="#0f1e38" strokeOpacity="0.15" strokeWidth="1.5" strokeLinecap="round" />
      {/* Connect lines */}
      <line x1="38" y1="36" x2="46" y2="32" stroke="#e8622a" strokeOpacity="0.2" strokeWidth="1.5" strokeDasharray="3 3" />
      <line x1="74" y1="32" x2="82" y2="36" stroke="#e8622a" strokeOpacity="0.2" strokeWidth="1.5" strokeDasharray="3 3" />
      {/* Bottom card */}
      <rect x="30" y="68" width="60" height="22" rx="8" fill="#e8622a" fillOpacity="0.08" stroke="#e8622a" strokeOpacity="0.2" strokeWidth="1" />
      <rect x="40" y="74" width="28" height="3.5" rx="1.75" fill="#e8622a" fillOpacity="0.3" />
      <rect x="40" y="80" width="20" height="3" rx="1.5" fill="#e8622a" fillOpacity="0.2" />
    </svg>
  );
}

function CampaignsIllustration() {
  return (
    <svg width="120" height="100" viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Megaphone body */}
      <path d="M30 35 L70 18 L70 68 L30 52Z" fill="#e8622a" fillOpacity="0.15" stroke="#e8622a" strokeOpacity="0.4" strokeWidth="1.5" strokeLinejoin="round" />
      {/* Handle */}
      <rect x="16" y="35" width="16" height="20" rx="4" fill="#e8622a" fillOpacity="0.2" stroke="#e8622a" strokeOpacity="0.35" strokeWidth="1.5" />
      {/* Bell end */}
      <ellipse cx="70" cy="43" rx="10" ry="22" fill="#e8622a" fillOpacity="0.1" stroke="#e8622a" strokeOpacity="0.3" strokeWidth="1.5" />
      {/* Signal waves */}
      <path d="M82 28 Q92 43 82 58" stroke="#e8622a" strokeOpacity="0.5" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M90 22 Q104 43 90 64" stroke="#e8622a" strokeOpacity="0.3" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M98 16 Q116 43 98 70" stroke="#e8622a" strokeOpacity="0.15" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      {/* Sparkle dots */}
      <circle cx="22" cy="18" r="3" fill="#e8622a" fillOpacity="0.5" />
      <circle cx="12" cy="30" r="2" fill="#e8622a" fillOpacity="0.35" />
      <circle cx="28" cy="8" r="2" fill="#e8622a" fillOpacity="0.25" />
    </svg>
  );
}

function KnowledgeIllustration() {
  return (
    <svg width="120" height="100" viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Books stack */}
      <rect x="18" y="54" width="72" height="28" rx="4" fill="#e8622a" fillOpacity="0.2" stroke="#e8622a" strokeOpacity="0.4" strokeWidth="1.5" />
      <rect x="24" y="40" width="64" height="18" rx="4" fill="#0f1e38" fillOpacity="0.1" stroke="#0f1e38" strokeOpacity="0.25" strokeWidth="1.5" />
      <rect x="30" y="28" width="56" height="16" rx="4" fill="#e8622a" fillOpacity="0.12" stroke="#e8622a" strokeOpacity="0.3" strokeWidth="1.5" />
      {/* Book spines */}
      <line x1="32" y1="54" x2="32" y2="82" stroke="#e8622a" strokeOpacity="0.3" strokeWidth="1.5" />
      <line x1="36" y1="40" x2="36" y2="58" stroke="#0f1e38" strokeOpacity="0.2" strokeWidth="1.5" />
      <line x1="40" y1="28" x2="40" y2="44" stroke="#e8622a" strokeOpacity="0.25" strokeWidth="1.5" />
      {/* Brain / bulb icon */}
      <circle cx="88" cy="20" r="14" fill="#e8622a" fillOpacity="0.1" stroke="#e8622a" strokeOpacity="0.25" strokeWidth="1.5" />
      <path d="M84 20 Q84 14 88 14 Q92 14 92 20 Q96 20 96 24 Q96 28 92 28 L84 28 Q80 28 80 24 Q80 20 84 20Z" fill="#e8622a" fillOpacity="0.35" />
      <line x1="88" y1="28" x2="88" y2="34" stroke="#e8622a" strokeOpacity="0.4" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="84" y1="34" x2="92" y2="34" stroke="#e8622a" strokeOpacity="0.3" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CrmIllustration() {
  return (
    <svg width="120" height="100" viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Kanban columns */}
      <rect x="8"  y="20" width="28" height="60" rx="6" fill="#e8622a" fillOpacity="0.08" stroke="#e8622a" strokeOpacity="0.2" strokeWidth="1.5" />
      <rect x="46" y="20" width="28" height="60" rx="6" fill="#0f1e38" fillOpacity="0.06" stroke="#0f1e38" strokeOpacity="0.15" strokeWidth="1.5" />
      <rect x="84" y="20" width="28" height="60" rx="6" fill="#e8622a" fillOpacity="0.08" stroke="#e8622a" strokeOpacity="0.2" strokeWidth="1.5" />
      {/* Cards in columns */}
      <rect x="12" y="28" width="20" height="12" rx="3" fill="#e8622a" fillOpacity="0.25" />
      <rect x="12" y="44" width="20" height="12" rx="3" fill="#e8622a" fillOpacity="0.18" />
      <rect x="12" y="60" width="20" height="12" rx="3" fill="#e8622a" fillOpacity="0.12" />
      <rect x="50" y="28" width="20" height="12" rx="3" fill="#0f1e38" fillOpacity="0.18" />
      <rect x="50" y="44" width="20" height="12" rx="3" fill="#0f1e38" fillOpacity="0.12" />
      <rect x="88" y="28" width="20" height="12" rx="3" fill="#e8622a" fillOpacity="0.2" />
      {/* Arrow between columns */}
      <path d="M36 43 L46 43" stroke="#e8622a" strokeOpacity="0.4" strokeWidth="1.5" strokeLinecap="round" markerEnd="url(#arrow)" />
      <path d="M74 43 L84 43" stroke="#e8622a" strokeOpacity="0.3" strokeWidth="1.5" strokeLinecap="round" />
      {/* $ signs */}
      <text x="53" y="38" fontSize="8" fill="#0f1e38" fillOpacity="0.4" fontWeight="bold">$</text>
      <text x="91" y="38" fontSize="8" fill="#e8622a" fillOpacity="0.5" fontWeight="bold">$</text>
    </svg>
  );
}

function SearchIllustration() {
  return (
    <svg width="120" height="100" viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="52" cy="44" r="28" fill="#e8622a" fillOpacity="0.08" stroke="#e8622a" strokeOpacity="0.25" strokeWidth="2" />
      <circle cx="52" cy="44" r="18" fill="#e8622a" fillOpacity="0.06" stroke="#e8622a" strokeOpacity="0.15" strokeWidth="1.5" />
      <line x1="73" y1="65" x2="96" y2="88" stroke="#e8622a" strokeOpacity="0.4" strokeWidth="4" strokeLinecap="round" />
      <line x1="44" y1="36" x2="60" y2="36" stroke="#e8622a" strokeOpacity="0.35" strokeWidth="2" strokeLinecap="round" />
      <line x1="44" y1="44" x2="56" y2="44" stroke="#e8622a" strokeOpacity="0.25" strokeWidth="2" strokeLinecap="round" />
      <circle cx="96" cy="16" r="4" fill="#e8622a" fillOpacity="0.3" />
      <circle cx="108" cy="28" r="3" fill="#e8622a" fillOpacity="0.2" />
      <circle cx="16" cy="28" r="3" fill="#e8622a" fillOpacity="0.2" />
    </svg>
  );
}

function CalendarIllustration() {
  return (
    <svg width="120" height="100" viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="18" y="22" width="84" height="66" rx="10" fill="#e8622a" fillOpacity="0.08" stroke="#e8622a" strokeOpacity="0.25" strokeWidth="1.5" />
      <rect x="18" y="22" width="84" height="22" rx="10" fill="#e8622a" fillOpacity="0.15" />
      <rect x="18" y="34" width="84" height="10" rx="0" fill="#e8622a" fillOpacity="0.08" />
      <line x1="18" y1="44" x2="102" y2="44" stroke="#e8622a" strokeOpacity="0.2" strokeWidth="1" />
      {/* Grid */}
      {[0,1,2,3,4,5,6].map(col => (
        <rect key={col} x={24 + col * 12} y="50" width="8" height="6" rx="2" fill="#e8622a" fillOpacity={col === 3 ? 0.4 : 0.12} />
      ))}
      {[0,1,2,3,4,5,6].map(col => (
        <rect key={col} x={24 + col * 12} y="60" width="8" height="6" rx="2" fill="#e8622a" fillOpacity={0.08} />
      ))}
      {[0,1,2,3,4].map(col => (
        <rect key={col} x={24 + col * 12} y="70" width="8" height="6" rx="2" fill="#e8622a" fillOpacity={0.08} />
      ))}
      {/* Header pins */}
      <rect x="34" y="14" width="6" height="16" rx="3" fill="#e8622a" fillOpacity="0.4" />
      <rect x="80" y="14" width="6" height="16" rx="3" fill="#e8622a" fillOpacity="0.4" />
    </svg>
  );
}

function MediaIllustration() {
  return (
    <svg width="120" height="100" viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background cards */}
      <rect x="30" y="30" width="60" height="55" rx="8" fill="#0f1e38" fillOpacity="0.06" stroke="#0f1e38" strokeOpacity="0.15" strokeWidth="1.5" />
      <rect x="18" y="20" width="60" height="55" rx="8" fill="#e8622a" fillOpacity="0.06" stroke="#e8622a" strokeOpacity="0.2" strokeWidth="1.5" />
      {/* Main card */}
      <rect x="34" y="14" width="62" height="55" rx="8" fill="white" stroke="#e8622a" strokeOpacity="0.25" strokeWidth="1.5" />
      {/* Image area */}
      <rect x="40" y="20" width="50" height="30" rx="5" fill="#e8622a" fillOpacity="0.1" />
      {/* Mountain icon */}
      <path d="M48 44 L58 30 L68 40 L73 34 L82 44Z" fill="#e8622a" fillOpacity="0.3" />
      <circle cx="74" cy="28" r="4" fill="#e8622a" fillOpacity="0.4" />
      {/* File info lines */}
      <rect x="40" y="54" width="30" height="4" rx="2" fill="#0f1e38" fillOpacity="0.2" />
      <rect x="40" y="62" width="20" height="3" rx="1.5" fill="#0f1e38" fillOpacity="0.12" />
      {/* Upload arrow */}
      <circle cx="96" cy="20" r="12" fill="#e8622a" fillOpacity="0.15" stroke="#e8622a" strokeOpacity="0.3" strokeWidth="1" />
      <path d="M96 26 L96 16 M92 20 L96 16 L100 20" stroke="#e8622a" strokeOpacity="0.6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ILLUSTRATIONS: Record<IllustrationType, React.FC> = {
  chat:       ChatIllustration,
  contacts:   ContactsIllustration,
  campaigns:  CampaignsIllustration,
  knowledge:  KnowledgeIllustration,
  crm:        CrmIllustration,
  search:     SearchIllustration,
  calendar:   CalendarIllustration,
  media:      MediaIllustration,
};

export function EmptyIllustration({ type, title, description, action, className }: EmptyIllustrationProps) {
  const Illustration = ILLUSTRATIONS[type];
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
      className={`flex flex-col items-center justify-center text-center py-12 px-6 ${className ?? ''}`}
    >
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
        className="mb-4 opacity-90"
      >
        <Illustration />
      </motion.div>
      <p className="text-sm font-semibold text-foreground mt-2">{title}</p>
      {description && (
        <p className="text-xs text-muted-foreground mt-1.5 max-w-[200px]">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </motion.div>
  );
}
