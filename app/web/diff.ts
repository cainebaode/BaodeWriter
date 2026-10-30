export type DiffLine={kind:'same'|'removed'|'added';text:string};

export function diffLines(before:string,after:string):DiffLine[]{
 const a=before?before.split('\n'):[],b=after?after.split('\n'):[];
 let start=0,end=0;
 while(start<a.length&&start<b.length&&a[start]===b[start])start++;
 while(end<a.length-start&&end<b.length-start&&a[a.length-1-end]===b[b.length-1-end])end++;
 const old=a.slice(start,a.length-end),next=b.slice(start,b.length-end);
 const result:DiffLine[]=a.slice(0,start).map(text=>({kind:'same',text}));
 // Bound work for very long rewrites; unchanged prefixes and suffixes still stay visible.
 if(old.length*next.length>250000){
  result.push(...old.map(text=>({kind:'removed' as const,text})),...next.map(text=>({kind:'added' as const,text})));
 }else{
  const lcs=Array.from({length:old.length+1},()=>new Uint32Array(next.length+1));
  for(let i=old.length-1;i>=0;i--)for(let j=next.length-1;j>=0;j--)lcs[i][j]=old[i]===next[j]?1+lcs[i+1][j+1]:Math.max(lcs[i+1][j],lcs[i][j+1]);
  let i=0,j=0;
  while(i<old.length||j<next.length){
   if(i<old.length&&j<next.length&&old[i]===next[j]){result.push({kind:'same',text:old[i++]});j++;}
   else if(i<old.length&&(j===next.length||lcs[i+1][j]>=lcs[i][j+1]))result.push({kind:'removed',text:old[i++]});
   else result.push({kind:'added',text:next[j++]});
  }
 }
 result.push(...a.slice(a.length-end).map(text=>({kind:'same' as const,text})));
 return result;
}
