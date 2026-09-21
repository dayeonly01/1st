const http=require('http'),fs=require('fs'),path=require('path');
const port=process.env.PORT||3000, root=path.join(__dirname,'public');
http.createServer((req,res)=>{
  const p=req.url==='/'?'/index.html':req.url.split('?')[0];
  const f=path.join(root,p);
  if(!f.startsWith(root)){res.writeHead(403);return res.end('Forbidden')}
  fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);return res.end('Not found')};
    const ext=path.extname(f); const type={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'}[ext]||'application/octet-stream';
    res.writeHead(200,{'Content-Type':type});res.end(d)});
}).listen(port,()=>console.log(`1등급 연습기: http://localhost:${port}`));
