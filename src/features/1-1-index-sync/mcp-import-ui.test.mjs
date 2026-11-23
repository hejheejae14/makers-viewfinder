import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// 실제 컴포넌트의 상태와 이벤트를 최소 JSX 환경에서 검증한다. 외부 요청은 없다.
function harness() {
  const slots=[],requests=[];let cursor=0;
  function state(init){const i=cursor++;if(!(i in slots))slots[i]=typeof init==='function'?init():init;return [slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];}
  const jsx=(type,props)=>({type,props});
  const modules={react:{useState:state,useRef:v=>state(()=>({current:v}))[0]},'react/jsx-runtime':{jsx,jsxs:jsx},
    '../../components/mds':Object.fromEntries(['Button','Callout','Select','TextButton','TextField'].map(k=>[k,k])),
    '../../lib/screen-identity':{SEARCH_TEAMS:['앱','플그','크루','공홈']},'./McpImportPanel.module.css':{default:{}}};
  const mod={exports:{}};
  const compiled=ts.transpileModule(readFileSync(new URL('./McpImportPanel.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  vm.runInNewContext(compiled,{module:mod,exports:mod.exports,require:name=>{assert.ok(name in modules,`예상하지 못한 모듈: ${name}`);return modules[name];},
    fetch:async(url,args)=>{const body=JSON.parse(args.body);requests.push({url,body,headers:args.headers});return {ok:true,json:async()=>body.action==='review'
      ?{id:'fixture-id',existing:298,additions:4,duplicates:0,conflicts:[],rejected:[],targetInUpload:true,targetInMerged:true,deleted:0,changed:0,canPublish:true}
      :{published:true,added:4,total:302}};}});
  return {requests,render:()=>{cursor=0;return mod.exports.McpImportPanel();}};
}
const walk=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(walk)];
const find=(root,type,predicate=()=>true)=>walk(root).find(n=>n.type===type&&predicate(n.props));
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('관리자 화면은 자동 호출·비밀번호 평문 출력 없이 검토 후 명시적 확인으로만 반영한다',async()=>{
  const h=harness();let root=h.render();assert.equal(h.requests.length,0);
  const fields=walk(root).filter(n=>n.type==='TextField');assert.equal(fields[0].props.type,'password');assert.equal(fields[1].props.type,'password');
  fields[0].props.onChange({target:{value:'FIXTURE_TEAM'}});fields[1].props.onChange({target:{value:'FIXTURE_ADMIN'}});
  fields[2].props.onChange({target:{files:[{size:100,text:async()=>'{}'}]}});
  root=h.render();find(root,'form').props.onSubmit({preventDefault(){}});await settle();root=h.render();
  assert.equal(h.requests.length,1);assert.equal(h.requests[0].body.action,'review');assert.equal(h.requests[0].url,'/api/admin/mcp-import');
  assert.equal(find(root,'Button',p=>p.variant==='danger').props.disabled,true);
  find(root,'input',p=>p.type==='checkbox').props.onChange({target:{checked:true}});root=h.render();
  const publish=find(root,'Button',p=>p.variant==='danger');assert.equal(publish.props.disabled,false);publish.props.onClick();await settle();root=h.render();
  assert.equal(h.requests.length,2);assert.equal(h.requests[1].body.action,'publish');assert.equal(h.requests[1].body.confirmed,true);
  assert.equal(h.requests[1].headers['x-mcp-admin-password'],'FIXTURE_ADMIN');
  assert.ok(!walk(root).filter(n=>n.type!=='TextField').some(n=>String(n.props.children).includes('FIXTURE_ADMIN')));
});

test('검토 뒤 팀·파일·관리자 비밀번호가 바뀌면 이전 반영 버튼을 제거한다',async()=>{
  for(const change of ['team','file','password']){
    const h=harness();let root=h.render();const fields=walk(root).filter(n=>n.type==='TextField');
    fields[0].props.onChange({target:{value:'FIXTURE_TEAM'}});fields[1].props.onChange({target:{value:'FIXTURE_ADMIN'}});
    fields[2].props.onChange({target:{files:[{size:100,text:async()=>'{}'}]}});
    root=h.render();find(root,'form').props.onSubmit({preventDefault(){}});await settle();root=h.render();assert.ok(find(root,'Button',p=>p.variant==='danger'));
    if(change==='team')find(root,'Select').props.onChange('플그');
    if(change==='file')find(root,'TextField',p=>p.type==='file').props.onChange({target:{files:[]}});
    if(change==='password')find(root,'TextField',p=>p.label==='가져오기 관리자 비밀번호').props.onChange({target:{value:'CHANGED'}});
    assert.equal(find(h.render(),'Button',p=>p.variant==='danger'),undefined);assert.equal(h.requests.length,1);
  }
});
