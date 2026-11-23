const legacySubjects={physics:'فیزیک',math:'ریاضی',chemistry:'شیمی'};
export function emptyStudyState(){return {subjects:[],sessions:[],goal:120,schemaVersion:2}}
export function readStudyState(data){
  if(!data||!Array.isArray(data.subjects)||!Array.isArray(data.sessions))return {state:emptyStudyState(),migrated:false};
  const state={...emptyStudyState(),...data};
  const migrated=(data.schemaVersion??0)<2;
  // Remove only the original automatically created subjects. Historical sessions
  // retain their own subject labels, and user-created subjects keep their IDs.
  if(migrated){state.subjects=data.subjects.filter(s=>legacySubjects[s.id]!==s.name);state.schemaVersion=2}
  return {state,migrated};
}

export function formatStudyDate(value,options,fallback='—'){
 if((typeof value!=='number'&&typeof value!=='string')||value==='')return fallback;
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return fallback;
 return new Intl.DateTimeFormat('fa-IR',options).format(date);
}
