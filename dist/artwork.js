/* Original celestial engravings. No remote resources, no user-supplied markup. */
(function (global) {
  'use strict';
  let sequence = 0;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const path = (d, cls = '', extra = '') => `<path d="${d}" class="${cls}" ${extra}/>`;
  const line = (x1, y1, x2, y2, cls = '') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${cls}"/>`;
  const circle = (x, y, r, cls = '') => `<circle cx="${x}" cy="${y}" r="${r}" class="${cls}"/>`;
  const group = (content, transform, cls = '') => `<g transform="${transform}" class="${cls}">${content}</g>`;
  const star = (x, y, r = 8, rays = 4, cls = 'star') => {
    const points = Array.from({length:rays * 2}, (_, i) => {
      const a = i * Math.PI / rays - Math.PI / 2, z = i % 2 ? r * .28 : r;
      return `${(x + Math.cos(a)*z).toFixed(2)},${(y + Math.sin(a)*z).toFixed(2)}`;
    }).join(' ');
    return `<polygon points="${points}" class="${cls}"/>`;
  };
  const rays = (x, y, r1, r2, count = 24, cls = 'fine') => Array.from({length:count}, (_, i) => {
    const a = Math.PI*2*i/count;
    return line(x+Math.cos(a)*r1,y+Math.sin(a)*r1,x+Math.cos(a)*(i%2?r2-5:r2),y+Math.sin(a)*(i%2?r2-5:r2),cls);
  }).join('');
  const moon = (x, y, r = 22) => path(`M ${x+8} ${y-r} A ${r} ${r} 0 1 0 ${x+8} ${y+r} A ${r*.8} ${r*.8} 0 0 1 ${x+8} ${y-r} Z`, 'gold-fill');
  const sun = (x, y, r = 24) => rays(x,y,r+6,r+23,24)+circle(x,y,r,'sun')+circle(x,y,r-5,'fine')+path(`M${x-9} ${y+5} Q${x} ${y+12} ${x+9} ${y+5}`,'fine')+circle(x-8,y-4,1.1,'solid')+circle(x+8,y-4,1.1,'solid');
  const water = (y = 370) => Array.from({length:5}, (_, j) => path(`M48 ${y+j*8} Q74 ${y-5+j*8} 100 ${y+j*8} T152 ${y+j*8} T204 ${y+j*8} T252 ${y+j*8}`, j%2?'dim':'fine')).join('');
  const mountain = (y = 346) => path(`M35 ${y+35} L83 ${y-31} L118 ${y+12} L170 ${y-52} L217 ${y+6} L265 ${y-20} V420 H35 Z`, 'mountain')+path(`M69 ${y-12} L83 ${y-31} L97 ${y-14} M148 ${y-28} L170 ${y-52} L189 ${y-29}`, 'fine');
  const leaves = (x, y, scale = 1, flip = 1) => group(path('M0 0 C-15 -36 -19 -68 -3 -105','fine')+Array.from({length:5}, (_,i)=>path(`M${-7-i*.8} ${-16-i*17} Q${-32+i} ${-18-i*17} ${-15-i} ${-32-i*17} Q${-5-i} ${-36-i*17} ${-7-i*.8} ${-16-i*17} M${-8-i} ${-25-i*16} Q${11-i*1.5} ${-28-i*16} ${4-i} ${-42-i*16} Q${-9-i} ${-41-i*16} ${-8-i} ${-25-i*16}`, 'leaf')).join(''),`translate(${x} ${y}) scale(${scale*flip} ${scale})`);
  const pillar = (x, y = 158, h = 209) => `<rect x="${x-12}" y="${y}" width="24" height="${h}" class="pillar"/><rect x="${x-18}" y="${y-5}" width="36" height="9" class="gold-fill"/><rect x="${x-19}" y="${y+h-1}" width="38" height="9" class="gold-fill"/>`+line(x-6,y+15,x-6,y+h-10,'fine')+line(x+6,y+15,x+6,y+h-10,'fine');
  const arch = () => path('M66 399 V190 A84 84 0 0 1 234 190 V399 M76 399 V190 A74 74 0 0 1 224 190 V399','fine');
  const crown = (x = 150, y = 192, s = 1) => group(path('M-28 0 L-35 -26 L-16 -15 L0 -37 L16 -15 L35 -26 L28 0 Z','gold-fill')+path('M-28 5 H28 M-24 11 H24','fine')+circle(0,-19,3,'jewel'),`translate(${x} ${y}) scale(${s})`);
  const head = (x, y, s = 1) => group(circle(0,0,12,'skin')+path('M-13 -3 Q-13 -21 1 -20 Q17 -18 13 1 M-6 14 Q0 18 6 14','fine'),`translate(${x} ${y}) scale(${s})`);
  const robe = (x = 150, y = 250, s = 1, seated = false) => group(path(seated?'M-21 0 Q0 -16 21 0 L44 105 Q0 122 -44 105 Z':'M-16 0 Q0 -10 16 0 L40 120 Q0 132 -40 120 Z','robe')+path('M-11 9 Q-9 59 -23 108 M0 8 Q12 63 9 111 M13 9 L29 105','fine')+head(0,-20),`translate(${x} ${y}) scale(${s})`);
  const sword = () => path('M0 -27 L5 -18 L3 15 H-3 L-5 -18 Z','blade')+path('M-12 15 Q0 11 12 15 M0 16 V31 M-4 31 H4','strong');
  const wand = () => path('M-3 29 L1 -27 L5 -30 L3 29 Z','gold-fill')+path('M1 -14 Q-15 -26 -10 -9 Q-4 -5 1 -14 M3 0 Q18 -15 14 0 Q10 7 3 0','leaf');
  const cup = () => path('M-18 -19 H18 L14 2 Q0 18 -14 2 Z','cup')+path('M-18 -15 Q-34 -15 -21 0 M18 -15 Q34 -15 21 0 M0 12 V25 M-12 28 Q0 23 12 28','strong')+path('M-12 -12 H12','fine');
  const pentacle = () => circle(0,0,23,'coin')+circle(0,0,18,'fine')+path('M0 -16 L9.4 12.9 L-15.2 -4.9 H15.2 L-9.4 12.9 Z','strong');
  const suitShapes = {wands:wand,cups:cup,swords:sword,pentacles:pentacle};
  const pip = (suit,x,y,scale=1,rotation=0) => group((suitShapes[suit]||pentacle)(),`translate(${x} ${y}) rotate(${rotation}) scale(${scale})`);
  const sceneStars = () => [[61,117,3],[93,151,2],[240,126,4],[215,183,2],[51,234,2],[250,263,2],[114,104,2],[197,106,2]].map(p=>star(...p)).join('');

  const major = n => {
    switch (n) {
      case 0: return sun(216,140,18)+mountain(356)+path('M62 367 L139 350 L164 370 L146 414 H57 Z','cliff')+robe(134,239,.84)+path('M145 248 L175 226 L209 234 M120 253 L101 234 M155 232 L199 209','strong')+circle(196,209,12,'bag')+path('M123 353 L115 373 M144 354 L153 368','strong')+star(103,224,9)+leaves(75,409,.5);
      case 1: return rays(150,158,23,41,32)+path('M128 154 C126 138 145 139 150 151 C156 139 174 139 172 154 C171 168 155 164 150 154 C142 168 128 168 128 154','strong')+robe(150,237,.9)+path('M132 245 L112 210 L119 190 M169 251 L188 290','strong')+line(120,177,120,207,'strong')+path('M86 327 H215 L204 340 H96 Z M104 342 L96 390 M196 342 L204 390','altar')+pip('cups',118,307,.48)+pip('pentacles',163,310,.42)+pip('swords',191,310,.39,90)+leaves(74,410,.7)+leaves(227,410,.7,-1);
      case 2: return pillar(67)+pillar(233)+path('M82 184 Q150 126 218 184 V368 H82 Z','veil')+moon(150,155,23)+robe(150,247,1.02,true)+path('M122 292 L168 286 L176 313 L126 320 Z','scroll')+moon(151,376,18)+circle(150,207,21,'fine')+crown(150,213,.62);
      case 3: return arch()+leaves(66,376,.8)+leaves(234,376,.8,-1)+circle(150,181,35,'dim')+Array.from({length:12},(_,i)=>star(150+Math.cos(i*Math.PI/6)*35,181+Math.sin(i*Math.PI/6)*35,3)).join('')+robe(151,261,1.08,true)+crown(150,223,.65)+path('M114 284 L94 255 M95 255 V214','strong')+star(95,207,7)+circle(208,349,23,'coin')+path('M208 333 V365 M197 354 H219 M197 342 A11 11 0 1 0 219 342','fine')+Array.from({length:7},(_,i)=>group(wand(),`translate(${67+i*28} 402) scale(.4 .6)`)).join('');
      case 4: return mountain(343)+path('M97 383 V217 H203 V383 M88 216 H211 M94 231 H207','throne')+robe(150,258,1.04,true)+crown(150,219,.76)+path('M115 284 L98 275 V231 M184 286 L202 274','strong')+circle(202,271,9,'coin')+path('M98 230 V211 M89 215 H107','strong')+path('M111 366 L103 394 M185 366 L193 394','strong');
      case 5: return pillar(69)+pillar(231)+arch()+robe(150,251,1.03,true)+crown(150,212,.64)+crown(150,197,.42)+path('M115 275 L104 251 L100 237 M184 270 L202 259 M202 192 V336 M192 208 H212 M195 196 H209 M190 220 H214','strong')+head(102,360,.8)+head(199,360,.8)+path('M78 410 Q78 373 102 373 Q128 373 128 410 M173 410 Q173 373 199 373 Q224 373 224 410','robe')+path('M143 366 L161 390 M160 366 L141 390','strong')+circle(142,364,5)+circle(162,364,5);
      case 6: return sun(150,132,22)+path('M128 187 Q150 170 172 187 L192 223 L150 211 L108 223 Z','wing')+head(150,174,.75)+robe(97,288,.82)+robe(204,288,.82)+path('M111 299 L136 316 L163 313 L189 298','strong')+mountain(407)+leaves(58,351,.7)+leaves(245,351,.7,-1)+path('M151 273 L139 260 C120 243 143 233 151 246 C160 232 181 244 165 259 Z','heart');
      case 7: return circle(150,151,40,'dim')+star(150,149,24,8)+path('M83 209 H217 L207 231 H93 Z M94 229 V349 H206 V229 M85 351 H215 V369 H85 Z','chariot')+robe(150,249,.66,true)+crown(150,222,.56)+path('M117 278 L102 299 M180 278 L199 300','strong')+circle(95,371,20,'wheel')+circle(207,371,20,'wheel')+rays(95,371,5,18,12)+rays(207,371,5,18,12)+path('M77 401 Q67 371 94 366 Q117 374 124 402 Z M179 402 Q183 373 207 366 Q233 376 223 401 Z','sphinx')+head(93,365,.55)+head(207,365,.55);
      case 8: return path('M126 154 C124 138 145 138 150 151 C156 139 176 138 174 154 C173 168 155 164 150 154 C141 169 127 169 126 154','strong')+robe(154,235,.91)+leaves(69,405,.58)+leaves(234,405,.58,-1)+path('M98 367 Q78 342 93 321 Q114 303 140 326 Q182 331 213 347 L217 373 H108 Z M205 350 Q233 317 231 339','lion')+circle(104,327,27,'mane')+circle(104,327,16,'sun')+path('M94 333 Q105 342 115 333 M137 258 Q134 289 113 313 M171 260 Q156 288 115 328','strong');
      case 9: return mountain(378)+robe(153,237,1.2)+path('M135 240 L106 222 L96 198 M180 252 L203 271 M201 220 V399','strong')+path('M80 171 H109 V211 H80 Z M85 170 Q95 150 104 170','lantern')+star(95,189,10,6)+rays(95,189,25,39,18,'dim')+path('M142 223 Q148 241 165 237','fine')+path('M118 407 L151 397 L189 410','fine');
      case 10: return circle(150,252,94,'wheel')+circle(150,252,78,'fine')+circle(150,252,54,'dim')+circle(150,252,20,'coin')+rays(150,252,22,76,8,'strong')+Array.from({length:8},(_,i)=>star(150+Math.cos(i*Math.PI/4)*87,252+Math.sin(i*Math.PI/4)*87,4)).join('')+path('M150 123 L137 147 H163 Z M147 129 L160 105','gold-fill')+leaves(68,392,.65)+leaves(235,392,.65,-1)+star(64,146,16,6)+star(237,354,16,6)+path('M62 210 Q38 249 68 288 M237 211 Q261 254 231 291','strong');
      case 11: return pillar(72,180,209)+pillar(228,180,209)+robe(150,251,1.04,true)+crown(150,211,.73)+path('M117 275 L91 264 M183 274 L210 248 M210 176 V297','strong')+group(sword(),'translate(210 213) scale(.8 1.5)')+path('M91 229 V288 M65 250 H117 M65 250 L51 286 H79 Z M117 250 L103 286 H131 Z','scales')+line(150,149,150,177,'fine')+star(150,138,9,4);
      case 12: return path('M73 155 H229 M97 144 V406 M88 155 Q92 116 106 130 M218 155 Q231 128 219 122','tree')+leaves(86,162,.48)+leaves(225,172,.43,-1)+line(165,155,165,205,'strong')+path('M165 204 L164 248 L129 278 M164 246 L196 267 L178 291','strong')+group(robe(0,0,.82),'translate(151 340) rotate(180)')+path('M131 309 L109 289 M171 309 L192 290','strong')+circle(151,363,27,'halo')+rays(151,363,29,35,20,'fine');
      case 13: return sun(220,336,18)+mountain(382)+path('M77 337 Q75 306 102 299 L174 299 L195 276 L222 284 L224 325 L207 332 L207 376 M98 328 L89 377 M129 330 L126 378 M185 328 L180 377','horse')+path('M135 303 L133 260 L154 242 L170 255 L159 303 Z','armor')+head(154,228,.8)+path('M145 227 H161 M145 234 H161','fine')+line(179,219,179,320,'strong')+path('M180 220 H225 V258 H180 Z','flag')+star(201,239,12,5)+water(389);
      case 14: return circle(150,168,27,'halo')+path('M129 219 Q74 202 77 284 L120 264 M172 219 Q224 202 223 284 L180 264','wing')+robe(150,235,1.05)+path('M130 247 L103 270 M170 247 L195 256','strong')+pip('cups',104,280,.6,-15)+pip('cups',192,264,.6,16)+path('M180 258 Q154 268 119 277 M178 264 Q150 277 117 284','fine')+path('M141 269 L150 252 L159 269 Z','gold-fill')+water(385)+leaves(65,390,.55);
      case 15: return path('M115 155 Q100 110 125 133 L142 158 M186 155 Q201 111 176 133 L160 158','horn')+head(150,179,1.3)+path('M131 215 Q70 178 74 272 L127 253 M170 215 Q232 178 226 272 L174 253','bat-wing')+robe(150,244,1.1,true)+star(150,147,12,5)+path('M116 285 L89 275 M184 284 L211 294','strong')+path('M211 301 L206 276 L217 283 L214 264 L228 286 Z','flame')+head(87,353,.65)+head(216,353,.65)+path('M71 410 L77 369 H97 L108 410 M195 410 L207 369 H226 L233 410','robe')+path('M95 373 Q151 407 208 373','chain')+circle(152,372,7,'coin');
      case 16: return mountain(389)+path('M106 402 L117 221 H184 L200 402 Z','tower')+path('M119 243 H182 M116 267 H187 M114 293 H188 M111 322 H192 M109 350 H195 M108 379 H198 M135 245 V264 M162 269 V289 M138 296 V318 M163 326 V347 M134 354 V376','dim')+path('M144 402 V365 A12 12 0 0 1 168 365 V402','window')+path('M128 277 V253 H141 V277 M159 305 V281 H172 V305','window')+path('M205 111 L158 174 H180 L146 226 L220 161 H196 Z','lightning')+group(crown(0,0,.8),'translate(142 204) rotate(-23)')+path('M110 241 L94 213 L92 243 L77 228 L89 268 M189 234 L205 216 L204 246 L225 233 L215 267','flame')+group(robe(0,0,.36),'translate(83 324) rotate(-48)')+group(robe(0,0,.36),'translate(219 355) rotate(145)')+Array.from({length:7},(_,i)=>star(62+i*28,286+(i%3)*32,3)).join('');
      case 17: return star(150,156,36,8)+rays(150,156,46,55,8,'fine')+[[71,139],[227,140],[91,218],[213,213],[62,275],[237,277],[149,246]].map(p=>star(...p,8,8)).join('')+water(360)+path('M114 358 Q116 312 153 307 L178 340 L205 357 M149 308 L145 280','strong')+head(144,266,.9)+path('M138 295 L108 322 M154 293 L182 314','strong')+pip('cups',105,329,.58,45)+pip('cups',186,321,.58,-45)+path('M89 332 Q76 357 89 367 M201 323 Q226 345 218 369','fine')+leaves(66,410,.5);
      case 18: return moon(150,162,31)+rays(150,162,39,56,28)+pillar(68,244,119)+pillar(232,244,119)+path('M139 409 C168 372 114 366 153 337 Q171 324 157 301','pathway')+path('M96 355 L88 330 L76 327 L81 348 L74 365 H113 L106 347 Z M195 355 L205 331 L218 330 L213 350 L220 365 H182 L188 347 Z','wolf')+water(389)+path('M142 386 Q150 369 158 386 L168 380 M142 386 L132 380 M145 391 L139 399 M155 391 L162 399','strong')+Array.from({length:9},(_,i)=>path(`M${95+i*14} ${227+i%2*9} l-3 6 l6 -1 Z`,'gold-fill')).join('');
      case 19: return sun(150,165,42)+rays(150,165,69,81,24,'dim')+path('M55 325 H245 V347 H55 Z M65 335 H235 M88 325 V345 M131 325 V345 M176 325 V345 M220 325 V345','wall')+Array.from({length:4},(_,i)=>group(sun(0,0,9),`translate(${73+i*52} 283)`)).join('')+path('M83 379 Q87 350 112 348 L180 351 L201 334 L225 343 L221 377 L207 385 L207 409 M109 381 L103 410 M182 384 L180 411','horse')+head(150,304,.75)+path('M136 322 Q150 316 163 325 L171 351 H135 Z M140 327 L117 317 M162 328 L186 307','skin')+line(188,288,188,365,'strong')+path('M188 288 Q220 280 236 304 Q218 294 188 309 Z','flag');
      case 20: return rays(150,150,34,64,32,'dim')+head(150,149,.85)+path('M126 176 Q83 143 67 188 L121 213 M173 176 Q218 144 235 188 L179 214','wing')+path('M134 178 L121 215 L180 216 L167 179 Z','robe')+path('M148 174 L180 183 L205 209 L191 221 L169 195 L142 190 Z','trumpet')+path('M168 198 V231 H192 V214 M176 211 H188 M182 205 V224','flag')+mountain(378)+[87,151,216].map((x,i)=>head(x,335-i%2*12,.65)+path(`M${x-13} 355 L${x-20} 407 H${x+20} L${x+13} 355 M${x-13} 360 L${x-32} 331 M${x+13} 360 L${x+30} 332`,'robe')).join('')+path('M64 400 H112 V417 H64 M128 401 H176 V418 H128 M193 400 H239 V417 H193','coffin');
      default: return `<ellipse cx="150" cy="258" rx="79" ry="130" class="wreath"/><ellipse cx="150" cy="258" rx="66" ry="116" class="fine"/>`+leaves(94,353,.9)+leaves(206,353,.9,-1)+star(69,126,15,8)+star(234,126,15,8)+star(69,392,15,8)+star(234,392,15,8)+robe(153,242,.95)+path('M135 255 L113 285 M171 254 L193 277 M112 269 V300 M195 262 V294','strong')+path('M144 355 L131 379 M170 354 L182 376','strong')+path('M137 133 Q151 119 164 133 M136 386 Q150 399 165 386','gold-fill');
    }
  };

  function minor(card) {
    const suit = ['wands','cups','swords','pentacles'].includes(card.suit) ? card.suit : 'pentacles';
    const rank = Math.max(1,Math.min(14,Number(card.rank)||1));
    let result = '';
    if (rank === 1) {
      result += circle(150,251,68,'halo')+circle(150,251,79,'dim')+rays(150,251,86,99,32)+pip(suit,150,251,2.1);
      result += path('M101 354 Q88 324 107 314 L132 326 Q150 337 167 324 L185 315 Q204 323 192 347 L168 362 H126 Z','hand');
      result += leaves(75,410,.62)+leaves(225,410,.62,-1);
    } else if (rank <= 10) {
      const layouts = {
        2:[[150,190],[150,316]],3:[[150,173],[104,292],[196,292]],
        4:[[101,181],[199,181],[101,323],[199,323]],
        5:[[101,170],[199,170],[150,250],[101,332],[199,332]],
        6:[[102,164],[198,164],[102,249],[198,249],[102,334],[198,334]],
        7:[[102,152],[198,152],[102,235],[198,235],[150,275],[102,349],[198,349]],
        8:[[102,146],[198,146],[102,217],[198,217],[102,289],[198,289],[102,360],[198,360]],
        9:[[102,144],[198,144],[102,214],[198,214],[150,252],[102,291],[198,291],[102,362],[198,362]],
        10:[[102,142],[198,142],[150,183],[102,216],[198,216],[102,289],[198,289],[150,330],[102,364],[198,364]]
      };
      result += path('M150 114 V391','dim')+`<ellipse cx="150" cy="253" rx="91" ry="152" class="dim"/>`;
      result += layouts[rank].map(([x,y],i)=>pip(suit,x,y,rank>7?.75:.88, suit==='swords' && i%2 ? 180:0)).join('');
      result += leaves(65,411,.45)+leaves(238,411,.45,-1);
    } else {
      result += arch()+circle(150,187,39,'halo')+rays(150,187,45,53,16,'dim');
      if (rank===11) {
        result += robe(149,239,1.1)+path('M131 259 L112 284 M168 258 L193 231','strong')+pip(suit,195,218,.85)+path('M135 205 Q151 186 165 205 L174 211 H127 Z','hat')+leaves(73,412,.62);
      } else if (rank===12) {
        result += mountain(386)+path('M70 365 Q72 329 105 323 L179 326 L197 302 L224 314 L227 350 L211 361 L211 404 M102 354 L94 403 M175 356 L167 403','horse')+robe(149,235,.7,true)+path('M137 249 L118 277 M162 247 L186 217','strong')+pip(suit,191,207,.9)+path('M137 207 H163 L158 194 H143 Z M146 194 Q132 173 147 168','armor');
      } else {
        result += path('M100 389 V230 H201 V389 M94 231 H207 M108 245 V376 M193 245 V376','throne')+robe(150,251,1.09,true)+crown(150,211,rank===14?.83:.65)+path('M117 281 L95 269 M183 280 L205 251','strong')+pip(suit,208,231,.87)+leaves(68,410,.61)+leaves(235,410,.61,-1);
        if(rank===13) result += moon(150,154,14); else result += star(150,153,16,8);
      }
    }
    return result;
  }

  function wrap(content, name, isBack) {
    const id = `tarot-art-${++sequence}`;
    const stars = sceneStars();
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 500" role="img" aria-label="${esc(name)}" class="tarot-engraving">
      <defs>
        <linearGradient id="${id}-bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#1b3939"/><stop offset=".46" stop-color="#102727"/><stop offset="1" stop-color="#081e22"/></linearGradient>
        <linearGradient id="${id}-gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f4dfad"/><stop offset=".35" stop-color="#ad8851"/><stop offset=".65" stop-color="#e8ce8e"/><stop offset="1" stop-color="#9c7842"/></linearGradient>
        <radialGradient id="${id}-halo"><stop stop-color="#8ba78b" stop-opacity=".18"/><stop offset="1" stop-color="#8ba78b" stop-opacity="0"/></radialGradient>
        <pattern id="${id}-grain" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".45" fill="#ead5a3" opacity=".14"/><path d="M5 3h1 M3 6h1" stroke="#ead5a3" stroke-width=".35" opacity=".09"/></pattern>
        <style>
        #${id} {stroke:#c6ab72;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;fill:none}
        #${id} .fine{stroke-width:.65;opacity:.75;fill:none} #${id} .dim{stroke-width:.6;opacity:.27;fill:none} #${id} .strong{stroke-width:1.8;fill:none}
        #${id} .gold-fill,#${id} .star,#${id} .solid{fill:url(#${id}-gold);stroke-width:.5}
        #${id} .robe{fill:#294440;stroke-width:1.5} #${id} .skin{fill:#d4bd8c;stroke:#c6ab72;stroke-width:1.2}
        #${id} .halo{fill:url(#${id}-halo);stroke:#b7a575;stroke-width:.6} #${id} .sun{fill:#d1b16d;stroke:#f3d8a0}
        #${id} .leaf{fill:#56715b;stroke:#abac77;stroke-width:.8} #${id} .mountain{fill:#1c3534;stroke:#6d8268;stroke-width:1}
        #${id} .pillar,#${id} .throne,#${id} .tower,#${id} .wall,#${id} .chariot,#${id} .altar,#${id} .coffin{fill:#29403c;stroke-width:1.4}
        #${id} .coin,#${id} .wheel{fill:#28413c;stroke:url(#${id}-gold);stroke-width:1.5}
        #${id} .cup{fill:#a58b57;stroke:#ead4a1;stroke-width:1.2} #${id} .blade{fill:#c3cfb9;stroke:#dbc796;stroke-width:1}
        #${id} .wing{fill:#7b8b6b;stroke:#cfbf88;stroke-width:1} #${id} .bat-wing{fill:#243130;stroke:#a99468;stroke-width:1.4}
        #${id} .hand,#${id} .horse,#${id} .sphinx{fill:#b1b393;stroke:#ddcda0;stroke-width:1.2}
        #${id} .heart,#${id} .flag,#${id} .flame{fill:#a36a4c;stroke:#d7a876;stroke-width:1.1}
        #${id} .lightning{fill:#f1d99b;stroke:#f5e4ba;stroke-width:1} #${id} .window{fill:#081b1e;stroke:#b8a16c;stroke-width:.8}
        #${id} .mane{fill:#9b8049;stroke:#c8b475} #${id} .lion{fill:#766c47;stroke:#c2ae75} #${id} .tree,#${id} .cliff{fill:#354b3b;stroke:#aca473}
        #${id} .scroll{fill:#c7ba91;stroke:#b8a16c} #${id} .veil{fill:#263c3b;stroke:#b6a46e;stroke-width:.8}
        #${id} .armor,#${id} .hat{fill:#5d7268;stroke:#cfbd86} #${id} .lantern{fill:#73663c;stroke:#f0d29a}
        #${id} .pathway{stroke:#a3b091;stroke-width:6;opacity:.45} #${id} .wolf{fill:#546354;stroke:#ccb77b}
        #${id} .wreath{stroke:#6e8465;stroke-width:13;fill:none} #${id} .chain{stroke:#b1a076;stroke-width:2;stroke-dasharray:3 3;fill:none}
        #${id} .jewel{fill:#244b49;stroke:#ead39c} #${id} .trumpet{fill:#b79a5f;stroke:#ebcf93}
        </style>
      </defs>
      <rect x="1" y="1" width="298" height="498" rx="13" fill="url(#${id}-bg)"/>
      <rect x="1" y="1" width="298" height="498" rx="13" fill="url(#${id}-grain)"/>
      <g id="${id}">
        <rect x="11" y="11" width="278" height="478" rx="8" stroke="url(#${id}-gold)"/>
        <rect x="17" y="17" width="266" height="466" rx="5" class="fine"/>
        <path d="M29 77V35H70 M230 35H271V77 M29 423V465H70 M230 465H271V423" class="fine"/>
        ${[[29,35],[271,35],[29,465],[271,465]].map(([x,y])=>star(x,y,7,4)).join('')}
        <path d="M40 62H123 M177 62H260 M40 438H123 M177 438H260" class="fine"/>
        ${star(150,62,7,4)}${star(150,438,7,4)}
        ${isBack?'':stars}
        ${content}
        <path d="M23 94V406 M277 94V406" class="dim"/>
        ${Array.from({length:15},(_,i)=>circle(23,112+i*19,1,'solid')+circle(277,112+i*19,1,'solid')).join('')}
      </g>
    </svg>`;
  }

  global.tarotArtwork = function (card = {}) {
    return wrap(card.arcana==='major' ? major(Math.max(0,Math.min(21,Number(card.rank)||0))) : minor(card), card.name || '塔罗牌', false);
  };

  global.tarotCardBack = function () {
    const content = circle(150,250,102,'fine')+circle(150,250,93,'dim')+circle(150,250,78,'fine')+circle(150,250,67,'dim')+rays(150,250,81,92,48)+
      path('M150 133 L165 233 L267 250 L165 266 L150 368 L135 266 L33 250 L135 233 Z','fine')+
      path('M78 177 L142 237 L223 177 L164 249 L223 323 L153 265 L78 323 L135 250 Z','dim')+
      circle(150,250,46,'coin')+sun(150,250,26)+moon(150,125,15)+group(moon(0,0,15),'translate(150 375) rotate(180)')+
      [[71,110],[228,109],[65,389],[235,389],[65,198],[235,302],[82,320],[215,174]].map(p=>star(...p,5,4)).join('')+
      leaves(61,414,.78)+leaves(239,414,.78,-1)+path('M51 87 Q150 110 249 87 M51 413 Q150 390 249 413','fine')+
      circle(150,250,116,'dim')+rays(150,250,119,124,60,'dim');
    return wrap(content, '星图塔罗牌背', true);
  };
})(typeof window !== 'undefined' ? window : globalThis);
