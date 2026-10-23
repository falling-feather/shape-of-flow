export function scientific(value){
  if(value===0)return '0';
  const magnitude=Math.abs(value);
  return magnitude<.01||magnitude>=1000?value.toExponential(2):magnitude<1?value.toPrecision(3):value.toFixed(3);
}
