// Read-only selection of a current frozen pair and a separately verified prior round.
// Never replace a current pending observation with a historical winner.
export function pairedDisplay(current, latestResolved) {
 const verified=latestResolved?.status==='RESOLVED' &&
  latestResolved?.settlement?.verified===true &&
  ['yes','no'].includes(latestResolved?.settlement?.result) &&
  typeof latestResolved?.ticker==='string' && latestResolved.ticker.length>0;
 const prior=verified && latestResolved.ticker!==current?.ticker?latestResolved:null;
 return {
  pairedShadow:current||prior||null,
  pairedShadowPrevious:!current&&Boolean(prior),
  pairedShadowLatestResolved:current&&prior?prior:null
 };
}
