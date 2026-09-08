// Presentation only. The database owns eligibility and all progression.
export function bundleProgress(bundle) {
  const rows=bundle.requirements??[];
  const target=rows.reduce((sum,r)=>sum+Number(r.required_amount),0);
  const contributed=rows.reduce((sum,r)=>sum+Math.min(Number(r.contributed??0),Number(r.required_amount)),0);
  return {target,contributed,percent:target?100*contributed/target:0,
    complete:Boolean(bundle.completed_at)||rows.length>0&&rows.every(r=>Number(r.contributed)>=Number(r.required_amount))};
}
export function requirementLabel(r) {
  if(r.manual_only) return 'The Crown Jewel · Cosmic+ · ≥5× · 2+ mutations';
  const mutation=r.mutation_id? r.mutation_id.charAt(0).toUpperCase()+r.mutation_id.slice(1).replaceAll('_',' '):'';
  return [mutation,r.gem_name??(!mutation?'Any gem':'specimens'),
    r.minimum_weight_multiplier?`≥${r.minimum_weight_multiplier}× final weight`:'',
    r.minimum_mutation_count?`${r.minimum_mutation_count}+ mutations`:''].filter(Boolean).join(' · ');
}
