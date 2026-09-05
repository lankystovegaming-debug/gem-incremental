export const shapes=[[[0,1],[1,1],[2,1],[3,1]],[[1,0],[2,0],[1,1],[2,1]],[[1,0],[0,1],[1,1],[2,1]],[[1,0],[2,0],[0,1],[1,1]],[[0,0],[1,0],[1,1],[2,1]],[[0,0],[0,1],[1,1],[2,1]],[[2,0],[0,1],[1,1],[2,1]]];
const cells=p=>{let c=shapes[p.type].map(v=>[...v]);for(let r=0;r<(p.type===1?0:p.r);r++)c=c.map(([x,y])=>[y, (p.type===0?3:2)-x]);return c.map(([x,y])=>[x+p.x,y+p.y]);};
export const pieceCells=cells;
