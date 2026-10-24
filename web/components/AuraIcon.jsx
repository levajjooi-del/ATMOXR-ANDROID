/* eslint-disable @next/next/no-img-element */
import React from 'react';

// Glifos extraídos dos PNGs Aura da referência enviada pelo usuário.
// youtube reaproveita a TV Aura; câmera, ajuda, remoto e mensagens usam os nomes do pack.
const auraAssets = {
  browser: 'browser', calculator: 'calculator', calendar: 'calendar', camera: 'camera',
  clock: 'clock', threads: 'threads', facebook: 'facebook', files: 'files', gallery: 'gallery',
  help: 'help', instagram: 'instagram', remote: 'remote', settings: 'settings', store: 'store',
  messages: 'messages', tv: 'tv', youtube: 'tv', whatsapp: 'whatsapp',
};

/** Ícones Aura da referência + vetores para apps que não têm glifo correspondente. */
const paths = {
  browser: <><circle cx="24" cy="24" r="17" /><path d="M7.5 24h33M24 7c5 5 7.5 10.7 7.5 17S29 36 24 41M24 7c-5 5-7.5 10.7-7.5 17S19 36 24 41" /></>,
  calculator: <><rect x="9" y="6" width="30" height="36" rx="6" /><path d="M15 13h18v7H15zM16 27h2m5 0h2m5 0h2M16 34h2m5 0h2m5 0h2" strokeWidth="3.5" /></>,
  calendar: <><rect x="7" y="10" width="34" height="31" rx="5" /><path d="M15 6v9M33 6v9M7 18h34M16 25h5m7 0h5m-17 8h5m7 0h5" /></>,
  camera: <><path d="M7 17a4 4 0 0 1 4-4h6l3-4h8l3 4h6a4 4 0 0 1 4 4v19a4 4 0 0 1-4 4H11a4 4 0 0 1-4-4z" /><circle cx="24" cy="26" r="8" /><circle cx="36" cy="18" r="1.3" fill="currentColor" stroke="none" /></>,
  clock: <><circle cx="24" cy="24" r="17" /><path d="M24 13v12l8 5" /></>,
  threads: <><path d="M33.8 19.4c-1.2-6.2-5.2-9.3-11-9.3-8 0-13.1 5.6-13.1 14.1 0 8.7 5.1 14.1 13.6 14.1 6.2 0 10.5-3 11.4-8.1.8-4.3-1.1-7-5.6-7.8-4.1-.7-7.5.7-8.2 3.6-.5 2.1 1 3.8 3.5 3.8 3.1 0 5.4-2.4 5.1-6.1-.4-4.9-4.3-7.8-9.2-7.1" /><path d="M31.3 20.7c3.7.8 5.6 2.9 6.1 6.6" /></>,
  facebook: <><path d="M27.8 42V26.2h5.4l.8-6.2h-6.2v-4c0-1.8.5-3 3.1-3h3.3V7.5c-.6-.1-2.7-.3-5.1-.3-5 0-8.4 3-8.4 8.7V20h-5.6v6.2h5.6V42z" fill="currentColor" stroke="none" /></>,
  files: <><path d="M6 15a4 4 0 0 1 4-4h11l4 5h13a4 4 0 0 1 4 4v17a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z" /><path d="M7 20h34" /></>,
  gallery: <><rect x="6" y="8" width="36" height="32" rx="6" /><circle cx="17" cy="19" r="3" /><path d="m9 35 10-10 7 7 5-5 8 8" /></>,
  help: <><path d="M8 9a5 5 0 0 1 5-5h22a5 5 0 0 1 5 5v22a5 5 0 0 1-5 5H20l-9 7v-7h-1a5 5 0 0 1-5-5V9z" /><path d="M18.5 17a5.5 5.5 0 1 1 9.3 4c-2.4 2.3-3.8 2.5-3.8 6m0 5h.1" /></>,
  instagram: <><rect x="7" y="7" width="34" height="34" rx="10" /><circle cx="24" cy="24" r="8" /><circle cx="34.5" cy="13.7" r="1.7" fill="currentColor" stroke="none" /></>,
  remote: <><rect x="5" y="7" width="38" height="27" rx="4" /><path d="M17 41h14m-7-7v7m-13-22h26" /></>,
  settings: <><path d="m20 5 1.2-2h5.6L28 5l.7 3.2 2.8 1.6 3.1-1.1 2.2 2.2-1.1 3.1 1.6 2.8 3.2.7v5.6l-3.2.7-1.6 2.8 1.1 3.1-2.2 2.2-3.1-1.1-2.8 1.6L28 36h-5.6l-1.2-3.2-2.8-1.6-3.1 1.1-2.2-2.2 1.1-3.1-1.6-2.8-3.2-.7v-5.6l3.2-.7 1.6-2.8-1.1-3.1 2.2-2.2 3.1 1.1 2.8-1.6z" transform="translate(1 5) scale(.92)" /><circle cx="24" cy="24" r="7" /></>,
  store: <><path d="M8 18h32l-2.5 22h-27z" /><path d="M16 18v-4a8 8 0 0 1 16 0v4M17 25v2m14-2v2" /></>,
  messages: <><path d="M7 10a6 6 0 0 1 6-6h22a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H20l-9 8v-8a6 6 0 0 1-4-6z" /><circle cx="17" cy="19" r="1.7" fill="currentColor" /><circle cx="24" cy="19" r="1.7" fill="currentColor" /><circle cx="31" cy="19" r="1.7" fill="currentColor" /></>,
  tv: <><rect x="5" y="9" width="38" height="27" rx="6" /><path d="m20 17 12 6.5-12 6.5z" fill="currentColor" stroke="none" /><path d="m17 4 7 5 7-5" /></>,
  whatsapp: <><path d="M40 23a16 16 0 0 1-23.5 14L7 40l3-9.2A16 16 0 1 1 40 23z" /><path d="M17 15c.8-1 2.4-.7 3 .4l1.4 2.8c.4.8.2 1.5-.4 2.1l-1 1c1.4 2.7 3.4 4.6 6 5.9l1-1.1c.6-.6 1.3-.8 2.1-.4l2.8 1.4c1.1.6 1.3 2.2.3 3-1.4 1.1-3 1.4-4.9.8-6.1-1.9-11.7-7.5-13.6-13.6-.5-1.8-.2-3.4.9-4.8z" /></>,
  grid: <><rect x="7" y="7" width="13" height="13" rx="3" /><rect x="28" y="7" width="13" height="13" rx="3" /><rect x="7" y="28" width="13" height="13" rx="3" /><rect x="28" y="28" width="13" height="13" rx="3" /></>,
  home: <><path d="m5 22 19-16 19 16v19H28V28h-8v13H5z" /></>,
  youtube: <><rect x="5" y="10" width="38" height="28" rx="8" /><path d="m21 17 12 7-12 7z" fill="currentColor" stroke="none" /></>,
  game: <><path d="M13 16h22a8 8 0 0 1 7.7 10L40 34a5 5 0 0 1-8.1 2.5L27 33h-6l-4.9 3.5A5 5 0 0 1 8 34l-2.7-8A8 8 0 0 1 13 16z" /><path d="M15 21v8m-4-4h8m12-1h.1m5 5h.1" /></>,
  beach: <><circle cx="33" cy="10" r="5" /><path d="M6 40c8-5 18-5 36 0M8 33c7-4 16-4 32 0M21 34c1-8 5-14 11-18M26 26l-5-2m7-3 1-5m-5 11 5 1" /></>,
  search: <><circle cx="21" cy="21" r="13" /><path d="m31 31 10 10" /></>,
  back: <><path d="M38 24H10m0 0 12-12M10 24l12 12" /></>,
  arrow: <><path d="M8 24h31m0 0L27 12m12 12L27 36" /></>,
  refresh: <><path d="M39 19a16 16 0 0 0-28-5l-3 4m0 0h10m-10 0V8M9 29a16 16 0 0 0 28 5l3-4m0 0H30m10 0v10" /></>,
  close: <><path d="m13 13 22 22M35 13 13 35" /></>,
  recenter: <><circle cx="24" cy="24" r="15" /><circle cx="24" cy="24" r="4" /><path d="M24 2v7m0 30v7M2 24h7m30 0h7" /></>,
  headset: <><path d="M7 26v-5a17 17 0 0 1 34 0v5" /><rect x="5" y="23" width="9" height="16" rx="4" /><rect x="34" y="23" width="9" height="16" rx="4" /></>,
  lock: <><rect x="8" y="20" width="32" height="23" rx="5" /><path d="M15 20v-6a9 9 0 0 1 18 0v6m-9 9v5" /></>,
  spotify: <><path d="M9 18c10-3 21-2 30 3M11 25c8-2 18-1 25 3M13 32c6-1 13 0 19 3" /></>,
  twitch: <><path d="M9 5h32v24l-9 9h-8l-6 5v-5H9z" /><path d="M18 14v10m12-10v10" strokeWidth="4" /></>,
  netflix: <><path d="M12 7h8l9 34h-8zM28 7h8v34h-8zM12 7v34m24-34v34" /></>,
  atmoxr: <><path d="M7 37 21 11a4 4 0 0 1 7 0l13 26M14 28h20" /><path d="M8 14c7 8 24 8 32 0" stroke="currentColor" opacity=".72" /></>,
  profile: <><circle cx="24" cy="17" r="8" /><path d="M8 41a16 16 0 0 1 32 0" /></>,
};

export default function AuraIcon({ name, size = 24, className = '' }) {
  const asset = auraAssets[name];
  if (asset) {
    return (
      <img
        className={`aura-icon aura-icon-image ${className}`.trim()}
        width={size}
        height={size}
        src={`/aura-icons/${asset}-fg.png`}
        alt=""
        aria-hidden="true"
        draggable="false"
      />
    );
  }

  return (
    <svg
      className={`aura-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name] || paths.grid}
    </svg>
  );
}
