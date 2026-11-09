export function isScalpEntryPrice(ask){
 return ask>=.01-Number.EPSILON&&ask<=.90+Number.EPSILON;
}
