const fs=require('node:fs');
function edit(path,from,to){const s=fs.readFileSync(path,'utf8');if(!s.includes(from))throw Error(path+': missing '+from.slice(0,80));fs.writeFileSync(path,s.replace(from,to));}
const p='src/utils/detail-motion.web.ts';
edit(p,'viewport.append(label);','viewport.appendChild(label);');
edit(p,'height: `${Math.max(from.height, to.height)}px`','height: `${from.height}px`');
edit(p,'width: `${from.width}px`, transform:', 'width: `${from.width}px`, height: `${from.height}px`, transform:');
edit(p,'width: `${to.width}px`, transform:', 'width: `${to.width}px`, height: `${to.height}px`, transform:');
edit(p,'const y = Math.max(0, (to.height - from.height) / 2), x = Math.max(0, (to.width - from.width) / 2);','const scale = Math.max(1, from.width / to.width, from.height / to.height);\n  const y = Math.max(0, (to.height - from.height / scale) / 2), x = Math.max(0, (to.width - from.width / scale) / 2);');
edit(p,'- to.height / 2}px, 0px)`, clipPath:', '- to.height / 2}px, 0px)${scale > 1 ? ` scale(${scale})` : \'\'}`, clipPath:');
edit('src/screens/itinerary-screen.tsx','setDetailOrigin(captureDetailOrigin(event)); entry.booking ? setViewingBookingId(entry.booking.id) : setViewingItemId(entry.item!.id);','setDetailOrigin(captureDetailOrigin(event)); if (entry.booking) setViewingBookingId(entry.booking.id); else setViewingItemId(entry.item!.id);');
edit('src/components/motion-modal.web.tsx','  dismiss.current = onDetailDismiss;','  useLayoutEffect(() => { dismiss.current = onDetailDismiss; }, [onDetailDismiss]);');
fs.unlinkSync(__filename);
