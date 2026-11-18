import * as THREE from 'three';
import {createSideEngravingGeometry} from './sideEngravingGeometry.js';

// ThoughtLeap's own silhouette, unchanged from the supplied Hero C source.
export const MARK_POINTS = [[227.15,261.48],[59.98,177.44],[485.96,27.51],[293.95,436.25]];
export const POLYGON = MARK_POINTS.map(([x,y]) => new THREE.Vector2((x-250)/100,-(y-250)/100));
export const DOT_HOME = new THREE.Vector3((93.56-250)/100,-(392.97-250)/100,.02);
export const SPINE_POINT = new THREE.Vector3(POLYGON[0].x,POLYGON[0].y,0);
export const SPINE_AXIS = new THREE.Vector3(POLYGON[2].x-POLYGON[0].x,POLYGON[2].y-POLYGON[0].y,0).normalize();

function area(points) {
  return points.reduce((a,p,i) => { const q=points[(i+1)%points.length]; return a+p.x*q.y-q.x*p.y; },0)/2;
}

function insetPolygon(points,distance) {
  const sign=Math.sign(area(points));
  const lines=points.map((a,i)=>{
    const b=points[(i+1)%points.length],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
    return {x:a.x-dy/length*distance*sign,y:a.y+dx/length*distance*sign,dx,dy};
  });
  return lines.map((b,i)=>{
    const a=lines[(i+lines.length-1)%lines.length],cross=a.dx*b.dy-a.dy*b.dx;
    const t=((b.x-a.x)*b.dy-(b.y-a.y)*b.dx)/cross;
    return new THREE.Vector2(a.x+a.dx*t,a.y+a.dy*t);
  });
}

function builder() {
  const positions=[],normals=[],uvs=[];
  function triangle(a,b,c,direction,uv=null) {
    let normal=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)).normalize();
    if(normal.dot(direction)<0){[b,c]=[c,b];normal.negate();if(uv)uv=[uv[0],uv[2],uv[1]];}
    for(const [i,p] of [a,b,c].entries()) {
      positions.push(p.x,p.y,p.z);normals.push(normal.x,normal.y,normal.z);
      uvs.push(...(uv?uv[i]:[(p.x+2.2)/4.8,(p.y+2.2)/4.8]));
    }
  }
  return {triangle,quad(a,b,c,d,direction,uv=null){triangle(a,b,c,direction,uv?[uv[0],uv[1],uv[2]]:null);triangle(a,c,d,direction,uv?[uv[0],uv[2],uv[3]]:null);},finish(){
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    geometry.computeBoundingSphere();return geometry;
  }};
}

/**
 * Parallel-offset construction, not a rounded extrusion. At the default .15/.4
 * dimensions this exactly preserves the earlier mark. Every edge has one flat
 * front bevel, one vertical satin flank and one matching flat rear bevel.
 * The optional secondary cut stays entirely inside that original bevel footprint:
 * a 30% outer band cuts more steeply into the flank while the broad inner
 * plane retains its original normal. Exact mitres keep both bands planar.
 */
export function createArrowGeometries({bevelWidth=.15,thickness=.4,doubleBevel=false,sideEngraving=false,engravingDepth=.005}={}) {
  if(!Number.isFinite(bevelWidth)||bevelWidth<.05||bevelWidth>.26)throw new RangeError('bevelWidth must be .05–.26');
  if(!Number.isFinite(thickness)||thickness<.18||thickness>.7)throw new RangeError('thickness must be .18–.7');
  const inset=insetPolygon(POLYGON,bevelWidth),front=builder(),rear=builder(),bevel=builder(),wall=builder();
  const half=thickness/2,depth=Math.min(bevelWidth*2/3,thickness*.28);
  const Z={front:.02+half,frontEdge:.02+half-depth,rearEdge:.02-half+depth,rear:.02-half};
  const ridge=doubleBevel?insetPolygon(POLYGON,bevelWidth*.3):null;
  const ridgeZ={front:Z.frontEdge+depth*.3,rear:Z.rearEdge-depth*.3};
  // Removing a little of the flank preserves the original broad-bevel angle.
  // The extra depth stays bounded even at the thinnest allowed body.
  if(doubleBevel){Z.frontEdge-=depth*.24;Z.rearEdge+=depth*.24;}
  const v=(p,z)=>new THREE.Vector3(p.x,p.y,z);
  const forward=new THREE.Vector3(0,0,1),backward=new THREE.Vector3(0,0,-1);
  for(const indices of THREE.ShapeUtils.triangulateShape(inset,[])) {
    front.triangle(...indices.map(i=>v(inset[i],Z.front)),forward);
    rear.triangle(...indices.map(i=>v(inset[i],Z.rear)),backward);
  }
  const sign=Math.sign(area(POLYGON));
  for(let i=0;i<POLYGON.length;i++) {
    const j=(i+1)%POLYGON.length,a=POLYGON[i],b=POLYGON[j];
    const length=a.distanceTo(b),bevelUV=[[0,1],[0,0],[length,0],[length,1]];
    if(doubleBevel) {
      // Two genuinely different hard normals. The face and outer XY contour
      // stay fixed; the extra cut follows the long edges through clean
      // mitred corners rather than creating thin caps or T-junctions.
      for(const [side,direction] of [['front',forward],['rear',backward]]) {
        const edgeZ=Z[side+'Edge'],faceZ=Z[side],middleZ=ridgeZ[side];
        bevel.quad(v(inset[i],faceZ),v(ridge[i],middleZ),v(ridge[j],middleZ),v(inset[j],faceZ),direction,bevelUV);
        bevel.quad(v(ridge[i],middleZ),v(a,edgeZ),v(b,edgeZ),v(ridge[j],middleZ),direction,bevelUV);
      }
    } else {
      // Keep the baseline vertex, normal, UV and triangle ordering untouched.
      bevel.quad(v(inset[i],Z.front),v(a,Z.frontEdge),v(b,Z.frontEdge),v(inset[j],Z.front),forward,bevelUV);
      bevel.quad(v(inset[i],Z.rear),v(a,Z.rearEdge),v(b,Z.rearEdge),v(inset[j],Z.rear),backward,bevelUV);
    }
    const outward=new THREE.Vector3((b.y-a.y)*sign,-(b.x-a.x)*sign,0).normalize();
    wall.quad(v(a,Z.frontEdge),v(a,Z.rearEdge),v(b,Z.rearEdge),v(b,Z.frontEdge),outward,[[0,1],[0,0],[length,0],[length,1]]);
  }
  const wallGeometry=sideEngraving===true?createSideEngravingGeometry({polygon:POLYGON,frontEdge:Z.frontEdge,rearEdge:Z.rearEdge,depth:engravingDepth}):wall.finish();
  const geometries={front:front.finish(),rear:rear.finish(),bevel:bevel.finish(),wall:wallGeometry};
  for(const [part,g] of Object.entries(geometries))g.userData={...g.userData,part,bevelWidth,thickness,bevelDepth:depth,construction:'flat parallel-offset planes'};
  if(doubleBevel)geometries.bevel.userData.secondaryCut={widthFraction:.3,slopeMultiplier:1.8,extraDepthFraction:.24};
  return geometries;
}

export function createCabochon(radius=.7953) {
  const thetaMax=1.05,sphereR=radius/Math.sin(thetaMax),segments=96,rows=40;
  const positions=[],normals=[],uvs=[],indices=[],zBase=Math.cos(thetaMax)*sphereR;
  for(let y=0;y<=rows;y++) {
    const t=y/rows*thetaMax,rad=Math.sin(t)*sphereR,z=Math.cos(t)*sphereR-zBase;
    for(let x=0;x<=segments;x++) {
      const a=x/segments*Math.PI*2,c=Math.cos(a),s=Math.sin(a);
      positions.push(c*rad,s*rad,z);normals.push(c*Math.sin(t),s*Math.sin(t),Math.cos(t));uvs.push(x/segments,y/rows);
    }
  }
  const stride=segments+1;
  for(let y=0;y<rows;y++)for(let x=0;x<segments;x++) {
    const i=y*stride+x;
    // At the pole only the second triangle has area.
    if(y>0)indices.push(i,i+stride,i+1);
    indices.push(i+1,i+stride,i+stride+1);
  }
  const center=positions.length/3;
  positions.push(0,0,0);normals.push(0,0,-1);uvs.push(.5,.5);
  const rim=positions.length/3;
  for(let x=0;x<segments;x++) {
    const a=x/segments*Math.PI*2,c=Math.cos(a),s=Math.sin(a);
    positions.push(c*radius,s*radius,0);normals.push(0,0,-1);uvs.push(.5+c*.5,.5+s*.5);
  }
  for(let x=0;x<segments;x++)indices.push(center,rim+(x+1)%segments,rim+x);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);
  geometry.computeBoundingSphere();return geometry;
}

/** V4 user revision: a complete sphere, centered at its origin, equal axes. */
export function createSphere(radius=.7953) {
  const geometry=new THREE.SphereGeometry(radius,96,64);
  geometry.userData={shape:'true sphere',radius,axes:[radius*2,radius*2,radius*2]};
  return geometry;
}

/** Numeric topology audit, independent of WebGL. Repeated vertices are intentional
 * at hard ridges; welding is only virtual for the manifold edge-count check. */
export function inspectArrowGeometry(geometries) {
  const edges=new Map(),counts={},problems=[];let maxNormalError=0,minTriangleArea=Infinity,volume=0;
  const key=v=>`${Math.round(v.x*1e6)},${Math.round(v.y*1e6)},${Math.round(v.z*1e6)}`;
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),ab=new THREE.Vector3(),ac=new THREE.Vector3(),normal=new THREE.Vector3();
  for(const [part,g] of Object.entries(geometries)) {
    const pos=g.getAttribute('position'),n=g.getAttribute('normal');counts[part]=pos.count/3;
    for(let i=0;i<pos.count;i+=3) {
      a.fromBufferAttribute(pos,i);b.fromBufferAttribute(pos,i+1);c.fromBufferAttribute(pos,i+2);
      ab.subVectors(b,a);ac.subVectors(c,a);const cross=ab.clone().cross(ac),area=cross.length()/2;
      minTriangleArea=Math.min(minTriangleArea,area);normal.copy(cross).normalize();
      if(area<1e-9)problems.push(`${part}: degenerate triangle ${i/3}`);
      for(let j=0;j<3;j++) {
        const stored=new THREE.Vector3().fromBufferAttribute(n,i+j);
        maxNormalError=Math.max(maxNormalError,Math.abs(stored.length()-1));
        if(normal.dot(stored)<.99999)problems.push(`${part}: winding or hard-normal mismatch ${i/3}`);
      }
      volume+=a.dot(new THREE.Vector3().crossVectors(b,c))/6;
      const keys=[key(a),key(b),key(c)];
      for(let j=0;j<3;j++) {
        const ends=[keys[j],keys[(j+1)%3]].sort(),edge=ends.join('|');edges.set(edge,(edges.get(edge)||0)+1);
      }
    }
  }
  const nonManifoldEdges=[...edges.values()].filter(n=>n!==2).length;
  if(nonManifoldEdges)problems.push(`${nonManifoldEdges} boundary or nonmanifold edges`);
  if(volume<=0)problems.push('Non-positive enclosed volume');
  return {ok:problems.length===0,triangleCounts:counts,triangles:Object.values(counts).reduce((a,b)=>a+b,0),nonManifoldEdges,maxNormalError,minTriangleArea,signedVolume:volume,problems};
}
