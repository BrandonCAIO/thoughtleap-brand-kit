import * as THREE from 'three';
import {SIDE_ENGRAVING_OUTLINE as OUTLINE} from './sideEngravingOutline.js';

/** Actual blind recesses in planar sidewalls; no texture, decal, or boolean runtime.
 * Material 0: original flank and counter islands. Material 1: cavity walls/floors.
 * Glyph data is a static licensed Plex subset, flattened to <.00026 world-unit
 * curve error at the default cap height. The broad face/bevel never enter here.
 */
export function createSideEngravingGeometry({polygon,frontEdge,rearEdge,depth=.005}) {
  if(!Number.isFinite(depth)||depth<.001||depth>.012)throw new RangeError('engravingDepth must be .001–.012');
  const height=frontEdge-rearEdge;
  if(!(height>0))throw new RangeError('Engraving requires a positive sidewall height');
  const positions=[],normals=[],uvs=[],groups=[];
  const counts={surface:0,floor:0,cavityWall:0};
  const area=p=>THREE.ShapeUtils.area(p);
  const sign=Math.sign(area(polygon));
  const capHeight=Math.min(.12,height*.60),scale=capHeight/OUTLINE.capHeight;
  const [xMin,yMin,xMax,yMax]=OUTLINE.bounds;
  const centerX=(xMin+xMax)/2,centerY=(yMin+yMax)/2;
  const metadata=[];
  function triangle(a,b,c,direction,uv,materialIndex,kind){
    // Calculate hard normals from the same float32 coordinates sent to WebGL.
    for(const p of [a,b,c])p.set(Math.fround(p.x),Math.fround(p.y),Math.fround(p.z));
    const normal=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)).normalize();
    if(normal.dot(direction)<0){[b,c]=[c,b];[uv[1],uv[2]]=[uv[2],uv[1]];normal.negate();}
    const start=positions.length/3;
    for(const [i,p] of [a,b,c].entries()){positions.push(p.x,p.y,p.z);normals.push(normal.x,normal.y,normal.z);uvs.push(...uv[i]);}
    const previous=groups.at(-1);
    if(previous?.materialIndex===materialIndex)previous.count+=3;else groups.push({start,count:3,materialIndex});
    counts[kind]++;
  }
  for(let edge=0;edge<polygon.length;edge++){
    const a=polygon[edge],b=polygon[(edge+1)%polygon.length],length=a.distanceTo(b);
    const tangent=new THREE.Vector3(b.x-a.x,b.y-a.y,0).normalize();
    const outward=new THREE.Vector3((b.y-a.y)*sign,-(b.x-a.x)*sign,0).normalize();
    const orientation=edge===1?-1:1;
    const oriented=p=>new THREE.Vector2(length/2+orientation*(p.x-length/2),(frontEdge+rearEdge)/2+orientation*(p.y-(frontEdge+rearEdge)/2));
    const at=(p,inset=0)=>{const q=oriented(p);return new THREE.Vector3(a.x+tangent.x*q.x,a.y+tangent.y*q.x,q.y).addScaledVector(outward,-inset);};
    const uv=p=>{const q=oriented(p);return [q.x,(q.y-rearEdge)/height];};
    const rect=[new THREE.Vector2(0,rearEdge),new THREE.Vector2(length,rearEdge),new THREE.Vector2(length,frontEdge),new THREE.Vector2(0,frontEdge)];
    function face(contour,holes,inset,materialIndex,kind){
      const points=[...contour,...holes.flat()];
      for(const ids of THREE.ShapeUtils.triangulateShape(contour,holes)){
        const tri=ids.map(i=>points[i]),boundary=[];
        // Earcut may remove a collinear vertex when connecting aligned holes.
        // Restore every contour point along those triangle edges so the top
        // surface, recess walls and counter islands share identical segments.
        for(let edge=0;edge<3;edge++){
          const a=tri[edge],b=tri[(edge+1)%3],dx=b.x-a.x,dy=b.y-a.y,length2=dx*dx+dy*dy;
          const extras=[];
          for(const p of points){
            const t=((p.x-a.x)*dx+(p.y-a.y)*dy)/length2;
            if(t>1e-8&&t<1-1e-8&&Math.abs((p.x-a.x)*dy-(p.y-a.y)*dx)<1e-11*Math.sqrt(length2))extras.push({p,t});
          }
          extras.sort((a,b)=>a.t-b.t);boundary.push(a,...extras.map(e=>e.p));
        }
        if(boundary.length===3){triangle(...tri.map(q=>at(q,inset)),outward,tri.map(uv),materialIndex,kind);continue;}
        const center=new THREE.Vector2((tri[0].x+tri[1].x+tri[2].x)/3,(tri[0].y+tri[1].y+tri[2].y)/3);
        for(let j=0;j<boundary.length;j++){
          const p=[center,boundary[j],boundary[(j+1)%boundary.length]];
          triangle(...p.map(q=>at(q,inset)),outward,p.map(uv),materialIndex,kind);
        }
      }
    }
    if(edge!==1&&edge!==2){face(rect,[],0,0,'surface');continue;}
    // Both sides read shoulder -> tip when exposed by the spine turn. Edge 1
    // needs a 180-degree in-plane rotation; this preserves the outward-facing
    // lettering basis (never a mirror) and the centered inscription footprint.
    // Apply the rotation after tessellation so both edges use an identical
    // local triangulation, avoiding numerically different hole bridge choices.
    const map=([x,y])=>new THREE.Vector2(length/2+sign*(x-centerX)*scale,(frontEdge+rearEdge)/2+(y-centerY)*scale);
    const orient=(points,winding)=>{if(Math.sign(area(points))!==winding)points.reverse();return points;};
    const shapes=OUTLINE.shapes.map(s=>({outer:orient(s.outer.map(map),1),holes:s.holes.map(h=>orient(h.map(map),-1))}));
    face(rect,shapes.map(s=>s.outer),0,0,'surface');
    for(const shape of shapes){
      // A counter is still top-level metal, not a hole through the arrow.
      for(const counter of shape.holes)face(counter,[],0,0,'surface');
    }
    for(const shape of shapes){
      face(shape.outer,shape.holes,depth,1,'floor');
      for(const loop of [shape.outer,...shape.holes])for(let j=0;j<loop.length;j++){
        const p=loop[j],q=loop[(j+1)%loop.length];
        // Filled glyph region is left of both outer and counter contours.
        const direction=tangent.clone().multiplyScalar(-(q.y-p.y)).add(new THREE.Vector3(0,0,q.x-p.x)).multiplyScalar(orientation).normalize();
        triangle(at(p),at(q),at(q,depth),direction,[uv(p),uv(q),uv(q)],1,'cavityWall');
        triangle(at(p),at(q,depth),at(p,depth),direction,[uv(p),uv(q),uv(p)],1,'cavityWall');
      }
    }
    metadata.push({edge,length,capHeight,depth,readingDirection:'shoulder-to-tip',rotationDegrees:edge===1?180:0,shapes:shapes.length,counters:shapes.reduce((n,s)=>n+s.holes.length,0),textWidth:(xMax-xMin)*scale,textHeight:(yMax-yMin)*scale});
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  for(const group of groups)geometry.addGroup(group.start,group.count,group.materialIndex);
  geometry.computeBoundingSphere();
  geometry.userData.sideEngraving={phrase:OUTLINE.phrase,font:OUTLINE.font,fontSha256:OUTLINE.fontSha256,depth,edges:metadata,triangleCounts:counts,materialSlots:{surface:0,cavity:1},method:'closed planar blind-cut geometry'};
  return geometry;
}
