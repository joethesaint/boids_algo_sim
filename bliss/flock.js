// Independent steering kernel: terrain-aware separation, alignment and cohesion.
export function createFlock(count,ground,random=Math.random) {
 const p=new Float32Array(count*3),v=new Float32Array(count*3),a=new Float32Array(count*3);
 for(let i=0;i<count;i++) {const j=i*3;p[j]=35+(random()-.5)*72;p[j+2]=15+(random()-.5)*65;p[j+1]=Math.max(ground(p[j],p[j+2])+22,70+random()*20);v[j]=4;v[j+2]=-10;}
 return {count,p,v,step(dt,time,scatter){
  if(!Number.isFinite(dt)||dt<=0)return;dt=Math.min(dt,1/30);
  const tx=35+95*Math.sin(time*.035),tz=-70+90*Math.cos(time*.028),ty=ground(tx,tz)+38;
  for(let i=0;i<count;i++) {
   const j=i*3,x=p[j],y=p[j+1],z=p[j+2];let sx=0,sy=0,sz=0,cx=0,cy=0,cz=0,ax=0,ay=0,az=0,n=0;
   for(let k=0;k<count;k++) {if(k===i)continue;const q=k*3,dx=x-p[q],dy=y-p[q+1],dz=z-p[q+2],d2=dx*dx+dy*dy+dz*dz;
    if(d2<225&&d2>.01){const w=(15-Math.sqrt(d2))/d2;sx+=dx*w;sy+=dy*w;sz+=dz*w;}
    if(d2<1600){cx+=p[q];cy+=p[q+1];cz+=p[q+2];ax+=v[q];ay+=v[q+1];az+=v[q+2];n++;}
   }
   let fx=sx*12+(tx-x)*.12,fy=sy*12+(ty-y)*.12,fz=sz*12+(tz-z)*.12;
   if(n){fx+=(cx/n-x)*.025+(ax/n-v[j])*.65;fy+=(cy/n-y)*.025+(ay/n-v[j+1])*.65;fz+=(cz/n-z)*.025+(az/n-v[j+2])*.65;}
   const clearance=Math.max(ground(x,z),ground(x+v[j]*2,z+v[j+2]*2))+16;
   if(y<clearance)fy+=(clearance-y)*2;
   if(scatter){const dx=x-scatter[0],dy=y-scatter[1],dz=z-scatter[2],d=Math.hypot(dx,dy,dz);if(d<55&&d>.1){const w=32*(1-d/55)/d;fx+=dx*w;fy+=dy*w;fz+=dz*w;}}
   const force=Math.hypot(fx,fy,fz),scale=force>16?16/force:1;a[j]=fx*scale;a[j+1]=fy*scale;a[j+2]=fz*scale;
  }
  for(let i=0;i<count;i++){const j=i*3;v[j]+=a[j]*dt;v[j+1]+=a[j+1]*dt;v[j+2]+=a[j+2]*dt;const speed=Math.hypot(v[j],v[j+1],v[j+2])||1,s=Math.min(16,Math.max(9,speed))/speed;v[j]*=s;v[j+1]*=s;v[j+2]*=s;p[j]+=v[j]*dt;p[j+1]+=v[j+1]*dt;p[j+2]+=v[j+2]*dt;p[j+1]=Math.max(p[j+1],ground(p[j],p[j+2])+8);}
 }};
}
