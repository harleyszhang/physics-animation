    const g = 9.8;
    const n1 = 1.0;
    const n2 = 1.33;
    const kElectro = 8.99e9;
    const MOBILE_BREAKPOINT = 900;

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    const toRad = (deg) => deg * Math.PI / 180;

    const escapeHTML = (str) =>
      str.replace(/&/g, '&amp;')
         .replace(/</g, '&lt;')
         .replace(/>/g, '&gt;');

    const audioEngine = (() => {
      let ctx = null;
      let gain = null;
      let osc = null;
      let enabled = false;
      const ensure = () => {
        if (ctx) return;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        ctx = new AudioContextClass();
        osc = ctx.createOscillator();
        gain = ctx.createGain();
        osc.type = 'sawtooth';
        gain.gain.value = 0;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
      };
      return {
        setEnabled(state) {
          enabled = state;
          if (!state) {
            if (gain && ctx) gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
            return;
          }
          ensure();
          if (ctx && ctx.state === 'suspended') ctx.resume();
        },
        update(signature) {
          if (!enabled || !gain || !ctx || !signature) return;
          const freq = clamp(signature.freq || 220, 60, 1200);
          const volume = clamp(signature.volume || 0.05, 0, 0.6);
          gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.05);
          osc.frequency.linearRampToValueAtTime(freq, ctx.currentTime + 0.05);
        },
        isEnabled() {
          return enabled;
        }
      };
    })();

    function formatFormula(text = '') {
      if (!text) return '';
      let html = escapeHTML(text);
      html = html.replace(/\\times/g, '&times;')
                 .replace(/\\cdot/g, '&middot;');
      html = replaceFractions(html);
      const symbolMap = [
        ['\\\\Delta', 'Δ'],
        ['\\\\alpha', 'α'],
        ['\\\\beta', 'β'],
        ['\\\\omega', 'ω'],
        ['\\\\theta', 'θ'],
        ['\\\\varphi', 'φ'],
        ['\\\\varepsilon', 'ε'],
        ['\\\\sin', 'sin'],
        ['\\\\cos', 'cos'],
        ['\\\\tan', 'tan'],
        ['\\\\pm', '±'],
        ['\\\\propto', '∝'],
        ['\\\\cdots', '⋯']
      ];
      symbolMap.forEach(([pattern, symbol]) => {
        html = html.replace(new RegExp(pattern, 'g'), symbol);
      });
      html = html.replace(/\^\{([^}]*)\}/g, '<sup>$1</sup>');
      html = html.replace(/_\{([^}]*)\}/g, '<sub>$1</sub>');
      return html;
    }

    function replaceFractions(str) {
      const extractGroup = (text, start) => {
        if (text[start] !== '{') return null;
        let depth = 0;
        for (let i = start; i < text.length; i++) {
          const char = text[i];
          if (char === '{') depth++;
          else if (char === '}') {
            depth--;
            if (depth === 0) {
              return { content: text.slice(start + 1, i), end: i + 1 };
            }
          }
        }
        return null;
      };
      let result = '';
      let i = 0;
      while (i < str.length) {
        if (str.slice(i, i + 5) === '\\frac') {
          const numGroup = extractGroup(str, i + 5);
          if (!numGroup) { result += '\\frac'; i += 5; continue; }
          const denGroup = extractGroup(str, numGroup.end);
          if (!denGroup) { result += '\\frac'; i += 5; continue; }
          result += `<span class="math-frac"><span class="top">${numGroup.content}</span><span class="bottom">${denGroup.content}</span></span>`;
          i = denGroup.end;
        } else {
          result += str[i];
          i++;
        }
      }
      return result;
    }

    function roundedRectPath(ctx, x, y, width, height, radius) {
      const r = Math.min(radius, width / 2, height / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + width - r, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + r);
      ctx.lineTo(x + width, y + height - r);
      ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
      ctx.lineTo(x + r, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }

    function drawArrow(ctx, fromX, fromY, toX, toY, color, width = 3) {
      const headLen = 12;
      const angle = Math.atan2(toY - fromY, toX - fromX);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(toX, toY);
      ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function computeAudioSignature(id, params) {
      switch (id) {
        case 'newton': {
          const acc = params.force / params.mass;
          return { freq: 180 + acc * 40, volume: clamp(acc / 10, 0.05, 0.5) };
        }
        case 'ohm': {
          const current = params.voltage / Math.max(params.resistance, 0.2);
          return { freq: 160 + current * 120, volume: clamp(current / 4, 0.05, 0.45) };
        }
        case 'series': {
          const current = params.voltage / Math.max(params.r1 + params.r2, 0.2);
          return { freq: 140 + current * 100, volume: clamp(current / 3, 0.05, 0.4) };
        }
        case 'capacitor': {
          const tau = (params.resistance * 1000) * (params.capacitance / 1000);
          return { freq: 120 + (1 / Math.max(tau, 0.1)) * 260, volume: 0.08 + 0.05 * Math.sin(params.time) };
        }
        case 'fuse': {
          const current = params.voltage / Math.max(params.load, 0.1);
          return { freq: 220 + current * 60, volume: clamp(current / params.fuseRating, 0.05, 0.5) };
        }
        case 'reflection':
        case 'refraction':
          return { freq: 350 + params.angle * 3, volume: 0.08 };
        case 'buoyancy': {
          const density = params.density;
          return { freq: 120 + density * 40, volume: 0.07 + 0.03 * Math.sin(params.time * 1.5) };
        }
        case 'pressure': {
          const pressure = params.density * 1000 * g * params.depth;
          return { freq: 140 + pressure / 4000, volume: 0.08 + Math.min(pressure / 400000, 0.25) };
        }
        case 'projectile': {
          const angle = toRad(params.angle || 0);
          const v = params.speed || 0;
          const vy = v * Math.sin(angle);
          const totalTime = Math.max(0.2, (vy * 2) / g);
          const t = params.time ? (params.time % totalTime) : 0;
          const height = vy * t - 0.5 * g * t * t;
          return {
            freq: 220 + Math.max(height, 0) * 5 + vy * 15,
            volume: 0.1 + Math.min(v / 40, 0.3)
          };
        }
        case 'circular': {
          const freq = params.speed * params.speed / params.radius;
          return { freq: 180 + freq * 30, volume: 0.06 + Math.min(freq / 20, 0.3) };
        }
        case 'reaction': {
          const thrust = params.pressure * 35;
          return { freq: 220 + thrust, volume: 0.08 + Math.min(thrust / 200, 0.4) };
        }
        case 'lens': {
          return { freq: 260 + params.intensity * 20, volume: 0.08 + params.intensity / 20 };
        }
        case 'dispersion':
          return { freq: 320 + params.spread * 40, volume: 0.07 + params.spread / 15 };
        case 'conduction':
          return { freq: 150 + params.temperature * 2, volume: 0.05 + params.time / 20 };
        case 'phase':
          return { freq: 200 + params.energy, volume: 0.08 + params.energy / 400 };
        default: {
          const sliderValues = Object.values(params).filter((v) => typeof v === 'number');
          const base = sliderValues.length ? sliderValues[0] : 1;
          return { freq: 150 + base * 10, volume: 0.07 };
        }
      }
    }

    function drawNewton(ctx, w, h, params) {
      const groundY = h * 0.8;
      ctx.save();
      const sky = ctx.createLinearGradient(0, 0, 0, groundY);
      sky.addColorStop(0, '#b1d4ff');
      sky.addColorStop(1, '#e8f1ff');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, groundY);
      ctx.fillStyle = '#9ea7ba';
      ctx.fillRect(0, groundY, w, h - groundY);
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.15;
      for (let i = 0; i < 5; i++) {
        ctx.fillRect(i * 120, groundY - 40, 80, 160);
      }
      ctx.globalAlpha = 1;

      const baseMass = 25;
      const heavyMass = baseMass + params.mass * 25;
      const carts = [
        { label: '空车', mass: baseMass, color: '#f8fbff', stripe: '#94c1ff', x: w * 0.18 },
        { label: '满载', mass: heavyMass, color: '#fff1d6', stripe: '#f59f45', x: w * 0.18 }
      ];
      const t = (params.time % 4);
      const force = params.force;
      const scale = 55;

      carts.forEach((cart, index) => {
        const acc = force / cart.mass;
        const displacement = 0.5 * acc * t * t * scale;
        const cartX = cart.x + displacement + index * 0.28 * w;
        const cartY = groundY - 65;

        // shoppers in background
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.arc(cartX - 140, groundY - 60 + Math.sin(params.time + index) * 2, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(cartX - 148, groundY - 60, 16, 40);

        // cart basket
        ctx.fillStyle = cart.color;
        roundedRectPath(ctx, cartX, cartY - 30, 140, 55, 18);
        ctx.fill();
        ctx.strokeStyle = '#c5ccd8';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = cart.stripe;
        ctx.fillRect(cartX + 8, cartY - 12, 124, 10);
        ctx.fillStyle = '#d9dfea';
        ctx.fillRect(cartX + 10, cartY + 8, 120, 6);
        ctx.fillStyle = '#a7b4ca';
        ctx.fillRect(cartX - 8, cartY + 6, 10, 45);

        // load crates for heavy cart
        if (index === 1) {
          ctx.fillStyle = '#9fc0ff';
          for (let i = 0; i < 3; i++) {
            ctx.fillRect(cartX + 15 + i * 35, cartY - 25, 30, 22);
            ctx.fillStyle = '#7aa5ff';
          }
        }

        const wheelPositions = [cartX + 25, cartX + 95];
        wheelPositions.forEach((wx) => {
          ctx.fillStyle = '#2f2f3c';
          ctx.beginPath();
          ctx.arc(wx, groundY - 8, 16, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#54607c';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(wx, groundY - 8, 8, 0, Math.PI * 2);
          ctx.stroke();
        });

        // person pushing
        const muscle = index === 0 ? '#fdd1a3' : '#f09a5b';
        const lean = index === 0 ? -0.15 : -0.35;
        ctx.save();
        ctx.translate(cartX - 40, groundY - 70);
        ctx.rotate(lean);
        ctx.fillStyle = muscle;
        ctx.fillRect(-6, 0, 12, 55);
        ctx.fillRect(-20, 10, 12, 55);
        ctx.fillStyle = '#ffcc8c';
        ctx.beginPath();
        ctx.arc(0, -12, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = index === 0 ? '#4c93ff' : '#ff6f4e';
        ctx.fillRect(-20, 20, 40, 46);
        ctx.restore();

        const arrowLen = 40 + force * 6;
        drawArrow(ctx, cartX - 20, cartY + 10, cartX - 20 + arrowLen, cartY + 10, '#ff9b45', 5);
        ctx.fillStyle = '#1f2a44';
        ctx.font = '13px Poppins, sans-serif';
        ctx.fillText(`${cart.label} a=${acc.toFixed(2)}m/s²`, cartX, cartY - 40);
      });

      ctx.fillStyle = '#1f2a44';
      ctx.font = '14px Poppins, sans-serif';
      ctx.fillText(`F = ${force.toFixed(1)} N`, w * 0.12, groundY + 30);
      ctx.fillText(`满载质量 ≈ ${heavyMass.toFixed(1)} kg`, w * 0.12, groundY + 52);
      ctx.restore();
    }

    function drawActionReaction(ctx, w, h, params) {
      const floor = h * 0.78;
      ctx.save();
      ctx.fillStyle = '#ffe9ff';
      ctx.fillRect(0, 0, w, floor);
      ctx.fillStyle = '#f5d0e8';
      ctx.fillRect(0, floor, w, h - floor);
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.25})`;
        ctx.beginPath();
        ctx.arc(80 + i * 120, 90 + Math.sin(params.time + i) * 8, 30, 0, Math.PI * 2);
        ctx.fill();
      }

      const thrust = params.pressure * 35;
      const mass = params.mass;
      const accel = thrust / mass;
      const t = params.time % 2.5;
      const baseX = w * 0.2;
      const pathY = floor - 120;
      const distance = accel * t * t * 60;
      const balloonX = baseX + distance;
      const balloonY = pathY - Math.sin(t * 3) * 40;

      // kids
      ctx.fillStyle = '#ffd8a8';
      ctx.beginPath();
      ctx.arc(w * 0.15, floor - 40, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8cc7ff';
      ctx.fillRect(w * 0.15 - 15, floor - 40, 30, 50);

      ctx.fillStyle = '#ffd8a8';
      ctx.beginPath();
      ctx.arc(w * 0.8, floor - 35, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffb077';
      ctx.fillRect(w * 0.8 - 14, floor - 35, 28, 45);

      // balloon
      ctx.save();
      ctx.translate(balloonX, balloonY);
      ctx.rotate(Math.sin(params.time * 1.5) * 0.2);
      const stretch = 1 + params.pressure * 0.1;
      ctx.scale(1, stretch);
      ctx.fillStyle = '#ff6fb2';
      ctx.beginPath();
      ctx.ellipse(0, 0, 40, 24, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // nozzle jet
      const jetLength = thrust * 0.6;
      const plumeAngle = Math.PI / 6;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(balloonX - 30, balloonY + 5);
      ctx.lineTo(balloonX - 30 - jetLength, balloonY + 5 + Math.tan(plumeAngle) * jetLength);
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.4 - i * 0.05})`;
        ctx.beginPath();
        ctx.arc(balloonX - 30 - i * 15, balloonY + 15 + Math.sin(params.time * 4 + i) * 6, 6 - i * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }

      // trajectory trail
      ctx.strokeStyle = 'rgba(255,111,178,0.3)';
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.moveTo(baseX, pathY);
      ctx.quadraticCurveTo(baseX + distance * 0.4, pathY - 60, balloonX, balloonY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#1f2a44';
      ctx.font = '14px Poppins, sans-serif';
      ctx.fillText(`推力 ≈ ${thrust.toFixed(1)} N`, w * 0.05, floor + 26);
      ctx.fillText(`气球质量 ≈ ${mass.toFixed(1)} g`, w * 0.35, floor + 26);
      ctx.fillText(`加速度 ≈ ${accel.toFixed(2)} m/s²`, w * 0.62, floor + 26);
      ctx.restore();
    }

    function drawBuoyancy(ctx, w, h, params) {
      const waterTop = h * 0.32;
      ctx.save();
      ctx.fillStyle = '#cfe8ff';
      ctx.fillRect(0, 0, w, waterTop);
      ctx.fillStyle = '#86c4ff';
      ctx.fillRect(0, waterTop, w, h - waterTop);
      ctx.strokeStyle = '#bfe2ff';
      for (let i = 0; i < 40; i++) {
        const waveY = waterTop + Math.sin(params.time * 2 + i) * (4 + params.density);
        ctx.beginPath();
        ctx.ellipse((i / 40) * w, waveY, 30, 10, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      const volumeM3 = params.volume / 1000;
      const buoy = 1000 * g * volumeM3;
      const weight = params.density * 1000 * g * volumeM3;
      const ratio = clamp(weight / buoy, 0.2, 1.5);
      const bob = Math.sin(params.time * 1.4) * 6;
      const boatWidth = 240;
      const boatHeight = 70;
      const boatX = w * 0.5 - boatWidth / 2;
      const boatY = waterTop + 45 * ratio + bob;

      ctx.fillStyle = '#b16c36';
      ctx.beginPath();
      ctx.moveTo(boatX, boatY);
      ctx.lineTo(boatX + boatWidth, boatY);
      ctx.quadraticCurveTo(boatX + boatWidth - 40, boatY + boatHeight, boatX + boatWidth / 2, boatY + boatHeight + 10);
      ctx.quadraticCurveTo(boatX + 40, boatY + boatHeight, boatX, boatY);
      ctx.fill();
      ctx.fillStyle = '#f8d8b0';
      ctx.fillRect(boatX + 40, boatY - 55, 60, 55);
      ctx.fillRect(boatX + boatWidth - 110, boatY - 45, 70, 45);
      ctx.fillStyle = '#4c7be5';
      roundedRectPath(ctx, boatX + boatWidth / 2 - 22, boatY - 75, 44, 65, 16);
      ctx.fill();
      ctx.fillStyle = '#fbd3a5';
      ctx.beginPath();
      ctx.arc(boatX + boatWidth / 2, boatY - 85, 22, 0, Math.PI * 2);
      ctx.fill();

      const centerX = boatX + boatWidth / 2;
      drawArrow(ctx, centerX, boatY + 12, centerX, boatY + 12 - buoy * 0.012, '#ff9b45', 5);
      drawArrow(ctx, centerX, boatY - 80, centerX, boatY - 80 + weight * 0.012, '#1f3f7a', 5);

      ctx.fillStyle = '#ffffff';
      ctx.font = '15px Poppins, sans-serif';
      ctx.fillText('浮力', centerX + 14, boatY + 12 - buoy * 0.012 - 6);
      ctx.fillText('重力', centerX + 14, boatY - 80 + weight * 0.012 + 16);
      ctx.fillStyle = '#1f2a44';
      ctx.font = '14px Poppins, sans-serif';
      ctx.fillText(`ρ物=${params.density.toFixed(2)} g/cm³`, boatX + 12, boatY - 95);
      ctx.fillText(`排水体积=${params.volume.toFixed(1)} L`, boatX + 12, boatY - 72);
      ctx.fillText(weight > buoy ? '船体下沉 → 过载' : '浮力≥重力 → 稳定漂浮', boatX + 12, boatY - 50);

      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(boatX + 60, boatY + 10);
      ctx.lineTo(boatX + boatWidth - 60, boatY + 10);
      ctx.stroke();

      ctx.restore();
    }

    function drawLever(ctx, w, h, params) {
      const pivotX = w * 0.5;
      const pivotY = h * 0.7;
      ctx.save();
      ctx.fillStyle = '#c76f3c';
      ctx.beginPath();
      ctx.moveTo(pivotX - 25, pivotY);
      ctx.lineTo(pivotX + 25, pivotY);
      ctx.lineTo(pivotX + 5, pivotY + 70);
      ctx.lineTo(pivotX - 5, pivotY + 70);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#a75625';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(w * 0.15, pivotY - 40);
      ctx.lineTo(w * 0.85, pivotY + 40);
      ctx.stroke();

      const leftPos = pivotX - params.leftArm * 45;
      const rightArm = 3;
      const rightPos = pivotX + rightArm * 45;
      const angleTilt = (params.leftForce * params.leftArm - rightArm * 3) * 0.005;

      ctx.save();
      ctx.translate(pivotX, pivotY);
      ctx.rotate(angleTilt);
      ctx.fillStyle = '#e4a653';
      ctx.fillRect(-w * 0.35, -12, w * 0.7, 24);
      ctx.restore();

      const childRadius = 28;
      ctx.fillStyle = '#ffcd9b';
      ctx.beginPath();
      ctx.arc(leftPos, pivotY - 70 - angleTilt * 40, childRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff9b45';
      ctx.fillRect(leftPos - 18, pivotY - 60 - angleTilt * 40, 36, 45);

      ctx.fillStyle = '#cbe5ff';
      ctx.beginPath();
      ctx.arc(rightPos, pivotY - 40 + angleTilt * 40, childRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4c7be5';
      ctx.fillRect(rightPos - 18, pivotY - 30 + angleTilt * 40, 36, 45);

      drawArrow(ctx, leftPos, pivotY - 80, leftPos, pivotY - 80 + params.leftForce * 8, '#ff9b45', 4);
      const needed = params.leftForce * params.leftArm / rightArm;
      drawArrow(ctx, rightPos, pivotY - 50, rightPos, pivotY - 50 + needed * 8, '#4c7be5', 4);
      ctx.restore();
    }

    function drawReflection(ctx, w, h, params) {
      ctx.save();
      const mist = ctx.createLinearGradient(0, 0, 0, h);
      mist.addColorStop(0, '#1a1d24');
      mist.addColorStop(1, '#2c3141');
      ctx.fillStyle = mist;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      for (let i = 0; i < 6; i++) {
        ctx.fillRect(i * 120 + 40, 60, 60, h - 120);
      }

      const mirrors = [w * 0.35, w * 0.55, w * 0.75];
      ctx.fillStyle = 'rgba(150,200,255,0.25)';
      mirrors.forEach((mx) => {
        ctx.fillRect(mx - 6, 80, 12, h - 160);
      });

      const source = { x: w * 0.15, y: h * 0.7 };
      const baseAngle = clamp(toRad(params.angle), toRad(5), toRad(75));
      let direction = { x: Math.cos(baseAngle), y: -Math.sin(baseAngle) };
      let currentPoint = source;
      const pathPoints = [source];
      mirrors.forEach((mx) => {
        const t = (mx - currentPoint.x) / direction.x;
        if (t <= 0) return;
        const y = currentPoint.y + direction.y * t;
        if (y < 120 || y > h - 120) return;
        currentPoint = { x: mx, y };
        pathPoints.push(currentPoint);
        direction.x *= -1;
      });
      const target = { x: w * 0.85, y: h * 0.35 };
      pathPoints.push(target);

      ctx.strokeStyle = '#00ff9c';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(pathPoints[0].x, pathPoints[0].y);
      for (let i = 1; i < pathPoints.length; i++) {
        ctx.lineTo(pathPoints[i].x, pathPoints[i].y);
      }
      ctx.stroke();

      ctx.fillStyle = '#ff4d4d';
      ctx.beginPath();
      ctx.arc(source.x, source.y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(target.x - 12, target.y - 12, 24, 24);

      ctx.fillStyle = '#1f8fff';
      ctx.font = '14px Poppins, sans-serif';
      ctx.fillText(`θi = θr = ${params.angle.toFixed(0)}°`, 30, 40);
      ctx.fillText('镜子迷宫：每次与镜面相遇，反射角等于入射角', 30, 64);
      ctx.restore();
    }

    function drawRefraction(ctx, w, h, params) {
      ctx.save();
      ctx.fillStyle = '#f7fbff';
      ctx.fillRect(0, 0, w, h);
      const tableY = h * 0.75;
      ctx.fillStyle = '#d9d9e3';
      ctx.fillRect(0, tableY, w, h - tableY);

      const cupX = w * 0.45;
      const cupY = tableY - 20;
      ctx.fillStyle = 'rgba(200,220,255,0.5)';
      ctx.beginPath();
      ctx.ellipse(cupX, cupY, 110, 30, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(cupX - 110, cupY - 160, 220, 140);
      ctx.strokeStyle = 'rgba(150,190,255,0.8)';
      ctx.lineWidth = 4;
      ctx.strokeRect(cupX - 110, cupY - 160, 220, 140);

      ctx.fillStyle = 'rgba(120,190,255,0.25)';
      ctx.fillRect(cupX - 108, cupY - 160, 216, 100);
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.25;
      ctx.fillRect(cupX - 70, cupY - 152, 30, 152);
      ctx.globalAlpha = 1;

      const stickStart = { x: w * 0.2, y: tableY - 60 };
      const stickMid = { x: cupX, y: cupY - 60 };
      const stickEnd = { x: cupX + 40, y: cupY - 150 };
      ctx.strokeStyle = '#c47a40';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(stickStart.x, stickStart.y);
      ctx.lineTo(stickMid.x, stickMid.y);
      ctx.lineTo(stickEnd.x, stickEnd.y);
      ctx.stroke();

      const rayOrigin = { x: stickMid.x + 10, y: stickMid.y - 10 };
      const angle = toRad(params.angle);
      const sinTheta2 = clamp((n2 / n1) * Math.sin(angle), -0.999, 0.999);
      const theta2 = Math.asin(sinTheta2);
      const rayLength = 220;
      ctx.strokeStyle = '#ffb347';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(rayOrigin.x, rayOrigin.y);
      ctx.lineTo(rayOrigin.x + Math.cos(angle) * 160, rayOrigin.y - Math.sin(angle) * 160);
      ctx.stroke();
      ctx.strokeStyle = '#66d9ff';
      ctx.beginPath();
      ctx.moveTo(rayOrigin.x, rayOrigin.y);
      ctx.lineTo(rayOrigin.x + Math.cos(theta2) * rayLength, rayOrigin.y - Math.sin(theta2) * rayLength);
      ctx.stroke();

      ctx.fillStyle = '#1f2a44';
      ctx.font = '14px Poppins, sans-serif';
      ctx.fillText(`θ水=${params.angle.toFixed(0)}°`, w * 0.1, 60);
      ctx.fillText(`θ空气=${(theta2 * 180 / Math.PI).toFixed(1)}°`, w * 0.1, 84);
      ctx.fillText('水杯中的筷子看似折断，其实是光线折射', w * 0.1, 110);
      ctx.restore();
    }

    function drawLens(ctx, w, h, params) {
      ctx.save();
      ctx.fillStyle = '#f6fff3';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#cfe7b5';
      ctx.beginPath();
      ctx.moveTo(0, h * 0.6);
      ctx.quadraticCurveTo(w * 0.5, h * 0.45, w, h * 0.6);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();

      const lensX = w * 0.45;
      const sunRays = [];
      for (let i = -2; i <= 2; i++) {
        sunRays.push({ angle: toRad(10 + i * 2) });
      }
      ctx.strokeStyle = 'rgba(255,215,128,0.7)';
      ctx.lineWidth = 4;
      sunRays.forEach((ray, idx) => {
        const startX = lensX - 220;
        const startY = 80 + idx * 30;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(lensX, startY + Math.tan(ray.angle) * 120);
        ctx.stroke();
      });

      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.ellipse(lensX, h * 0.35, 30, 140, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#7ab7ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(lensX, h * 0.35, 30, 140, 0, 0, Math.PI * 2);
      ctx.stroke();

      const focal = params.distance;
      const focusPoint = { x: lensX + focal * 80, y: h * 0.6 };
      ctx.strokeStyle = '#ffb347';
      ctx.lineWidth = 4;
      sunRays.forEach((ray, idx) => {
        const startY = 80 + idx * 30;
        ctx.beginPath();
        ctx.moveTo(lensX, startY + Math.tan(ray.angle) * 120);
        ctx.lineTo(focusPoint.x, focusPoint.y);
        ctx.stroke();
      });

      ctx.fillStyle = '#6b4b2b';
      ctx.fillRect(focusPoint.x - 10, focusPoint.y - 10, 20, 50);
      ctx.fillStyle = '#88c057';
      ctx.beginPath();
      ctx.ellipse(focusPoint.x, focusPoint.y - 20, 40, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      const glow = ctx.createRadialGradient(focusPoint.x, focusPoint.y - 20, 5, focusPoint.x, focusPoint.y - 20, 40);
      glow.addColorStop(0, `rgba(255,230,120,${params.intensity / 10})`);
      glow.addColorStop(1, 'rgba(255,230,120,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(focusPoint.x, focusPoint.y - 20, 60, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#1f2a44';
      ctx.font = '14px Poppins, sans-serif';
      ctx.fillText(`焦距设置≈${focal.toFixed(1)} 倍`, 30, 50);
      ctx.fillText(`光强比=${params.intensity.toFixed(1)}`, 30, 74);
      ctx.restore();
    }

    function drawDispersion(ctx, w, h, params) {
      ctx.save();
      ctx.fillStyle = '#fdf7ed';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#e9d8c0';
      ctx.fillRect(0, h * 0.7, w, h * 0.3);

      ctx.fillStyle = '#c1c1cf';
      ctx.beginPath();
      ctx.moveTo(w * 0.6, h * 0.3);
      ctx.lineTo(w * 0.7, h * 0.5);
      ctx.lineTo(w * 0.5, h * 0.5);
      ctx.closePath();
      ctx.fill();

      const whiteRayX = w * 0.2;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(whiteRayX, h * 0.35);
      ctx.lineTo(w * 0.55, h * 0.38);
      ctx.stroke();

      const colors = ['#ff4b4b', '#ffa53b', '#ffe14b', '#5bd45b', '#3ea1ff', '#6f52ff', '#a34cff'];
      colors.forEach((color, idx) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(w * 0.58, h * 0.39);
        ctx.lineTo(w * 0.9, h * 0.4 + idx * 10 * (params.spread / 2));
        ctx.stroke();
      });

      ctx.fillStyle = '#d9dedd';
      ctx.beginPath();
      ctx.ellipse(w * 0.9, h * 0.55, 120, 40, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#1f2a44';
      ctx.font = '14px Poppins, sans-serif';
      ctx.fillText('白光 → 三棱镜 → 彩虹', 30, 40);
      ctx.fillText(`色散角≈${(params.spread * 20).toFixed(1)}°`, 30, 64);
      ctx.restore();
    }

    function drawConduction(ctx, w, h, params) {
      ctx.save();
      ctx.fillStyle = '#f8f0ea';
      ctx.fillRect(0, 0, w, h);
      const stoveY = h * 0.65;
      ctx.fillStyle = '#b4b0ad';
      ctx.fillRect(0, stoveY, w, h - stoveY);

      ctx.fillStyle = '#a34927';
      ctx.fillRect(w * 0.2, stoveY - 120, w * 0.6, 120);
      ctx.fillStyle = '#f5aa63';
      ctx.beginPath();
      ctx.ellipse(w * 0.5, stoveY - 120, 250, 60, 0, 0, Math.PI);
      ctx.fill();

      const timeFactor = params.time;
      const soupTemp = params.temperature;
      const metalHeat = clamp(timeFactor * soupTemp / 100, 0, 1);
      const plasticHeat = clamp(timeFactor * 0.3, 0, 0.4);

      const spoons = [
        { x: w * 0.38, label: '金属勺', heat: metalHeat, color: '#c0cad6' },
        { x: w * 0.62, label: '塑料勺', heat: plasticHeat, color: '#f2d5ff' }
      ];
      spoons.forEach((spoon) => {
        const gradient = ctx.createLinearGradient(0, stoveY - 200, 0, stoveY + 20);
        gradient.addColorStop(0, `rgba(255,120,80,${spoon.heat})`);
        gradient.addColorStop(1, spoon.color);
        ctx.fillStyle = gradient;
        ctx.fillRect(spoon.x - 10, stoveY - 200, 20, 210);
        ctx.fillStyle = '#d88947';
        ctx.beginPath();
        ctx.arc(spoon.x, stoveY - 200, 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1f2a44';
        ctx.font = '13px Poppins, sans-serif';
        ctx.fillText(spoon.label, spoon.x - 30, stoveY - 220);
      });

      ctx.fillStyle = '#ffffff';
      ctx.font = '14px Poppins, sans-serif';
      ctx.fillText(`时间 = ${params.time.toFixed(1)} s`, 30, 40);
      ctx.fillText(`汤温 ≈ ${params.temperature.toFixed(0)} °C`, 30, 64);
      ctx.restore();
    }

    function drawPhase(ctx, w, h, params) {
      ctx.save();
      ctx.fillStyle = '#f0fbff';
      ctx.fillRect(0, 0, w, h);
      const mid = w / 2;
      ctx.fillStyle = '#dbeeff';
      ctx.fillRect(0, 0, mid, h);
      ctx.fillStyle = '#ffe9d2';
      ctx.fillRect(mid, 0, mid, h);

      const meltLevel = clamp(params.energy / 100, 0, 1);
      ctx.fillStyle = '#d4f1ff';
      ctx.beginPath();
      ctx.ellipse(mid * 0.4, h * 0.6, 80, 30, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#a0d8ff';
      ctx.fillRect(mid * 0.4 - 60, h * 0.5, 120, 20 + meltLevel * 50);
      ctx.fillStyle = '#f7fbff';
      ctx.fillRect(mid * 0.4 - 50, h * 0.5 - meltLevel * 30, 100, 40 - meltLevel * 20);

      ctx.fillStyle = '#ffe1a8';
      ctx.beginPath();
      ctx.ellipse(mid + mid * 0.3, h * 0.6, 80, 30, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#febc5c';
      ctx.beginPath();
      ctx.arc(mid + mid * 0.3, h * 0.58, 40, 0, Math.PI * 2);
      ctx.fill();
      const bubbleCount = 8;
      for (let i = 0; i < bubbleCount; i++) {
        const bx = mid + mid * 0.3 + Math.sin(params.time * 2 + i) * 30;
        const by = h * 0.6 - i * 15;
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.arc(bx, by, 6, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = '#1f2a44';
      ctx.font = '14px Poppins, sans-serif';
      ctx.fillText(`吸收热量 Q = ${params.energy.toFixed(0)} kJ`, 30, 40);
      ctx.fillText(`蒸发速率 = ${(params.energy * 0.02).toFixed(1)} g/s`, mid + 20, 40);
      ctx.restore();
    }

    function drawOhm(ctx, w, h, params) {
      ctx.save();
      const deskY = h * 0.72;
      ctx.fillStyle = '#f1f5ff';
      ctx.fillRect(0, 0, w, deskY);
      ctx.fillStyle = '#d7e0f7';
      ctx.fillRect(0, deskY, w, h - deskY);

      ctx.fillStyle = '#c08a56';
      ctx.fillRect(w * 0.18, deskY - 15, w * 0.64, 15);

      const safeResistance = Math.max(params.resistance, 0.2);
      const current = params.voltage / safeResistance;
      const brightness = clamp(current / 0.4, 0, 2.4);
      const monitorGlow = clamp(current / 0.35, 0.1, 1.2);
      const motorSpeed = clamp(current * 120, 10, 420);

      ctx.fillStyle = '#3b3c4f';
      ctx.fillRect(w * 0.2, deskY - 90, 28, 90);
      ctx.fillRect(w * 0.77, deskY - 90, 28, 90);

      const lampX = w * 0.45;
      const lampY = deskY - 110;
      ctx.fillStyle = `rgba(247,193,74,${0.6 + 0.2 * Math.min(1, brightness)})`;
      ctx.beginPath();
      ctx.arc(lampX, lampY, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff7de';
      ctx.beginPath();
      ctx.arc(lampX, lampY, 20, 0, Math.PI * 2);
      ctx.fill();
      const glow = ctx.createRadialGradient(lampX, lampY, 15, lampX, lampY, 140);
      glow.addColorStop(0, `rgba(255,233,150,${0.8 * Math.min(1, brightness)})`);
      glow.addColorStop(1, 'rgba(255,233,150,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(lampX, lampY, 120, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#1f1f2f';
      ctx.fillRect(w * 0.3, deskY - 70, 90, 55);
      ctx.fillStyle = `rgba(80,190,255,${0.2 + 0.4 * monitorGlow})`;
      ctx.fillRect(w * 0.31, deskY - 65, 72, 42);
      ctx.fillStyle = `rgba(255,255,255,${0.15 * monitorGlow})`;
      ctx.fillRect(w * 0.31, deskY - 65, 72 * monitorGlow, 42);

      const motorX = w * 0.65;
      const motorY = deskY - 70;
      ctx.fillStyle = '#6c7bd8';
      ctx.fillRect(motorX - 40, motorY - 40, 80, 80);
      ctx.save();
      ctx.translate(motorX, motorY);
      ctx.rotate(params.time * motorSpeed * 0.02);
      ctx.fillStyle = '#f5f5f5';
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.fillRect(0, -6, 32, 12);
      }
      ctx.restore();
      ctx.fillStyle = '#f1a45c';
      ctx.fillRect(motorX - 60, motorY + 50, 120, 14);
      for (let i = 0; i < 3; i++) {
        const offset = ((params.time * motorSpeed * 0.4) + i * 60) % 160;
        ctx.fillStyle = '#ffd27a';
        ctx.fillRect(motorX - 70 + offset, motorY + 36, 24, 14);
      }

      ctx.strokeStyle = '#4c7be5';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(w * 0.22, deskY - 40);
      ctx.lineTo(lampX - 34, deskY - 60);
      ctx.lineTo(w * 0.62, deskY - 45);
      ctx.lineTo(w * 0.79, deskY - 30);
      ctx.stroke();

      ctx.strokeStyle = '#ff9b45';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(w * 0.22, deskY - 10);
      ctx.lineTo(w * 0.79, deskY - 10);
      ctx.stroke();
      const dashCount = 12;
      for (let i = 0; i < dashCount; i++) {
        const t = (i / dashCount + params.time * current * 0.5) % 1;
        const x = w * 0.22 + t * (w * 0.57);
        ctx.fillStyle = '#ff9b45';
        ctx.beginPath();
        ctx.arc(x, deskY - 10, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = '#1f2a44';
      ctx.font = '14px Poppins, sans-serif';
      ctx.fillText('电池', w * 0.2, deskY - 105);
      ctx.fillText('灯泡 + 工位', lampX - 45, deskY - 140);
      ctx.fillText('电脑监控', w * 0.31, deskY - 80);
      ctx.fillText('工厂电机', motorX + 20, motorY - 45);
      ctx.fillText(`I = ${(current).toFixed(2)} A`, w * 0.48, deskY - 135);
      ctx.fillText(`P = UI = ${(params.voltage * current).toFixed(1)} W`, w * 0.48, deskY - 110);
      ctx.fillText(`转速 ~ ${(motorSpeed).toFixed(0)} rpm`, w * 0.48, deskY - 85);
      ctx.restore();
    }

    function drawSeries(ctx, w, h, params) {
      const tableY = h * 0.75;
      ctx.save();
      ctx.fillStyle = '#eef3ff';
      ctx.fillRect(0, 0, w, tableY);
      ctx.fillStyle = '#d8e0f0';
      ctx.fillRect(0, tableY, w, h - tableY);

      ctx.fillStyle = '#444';
      ctx.fillRect(w * 0.18, tableY - 70, 25, 70);
      ctx.fillRect(w * 0.82 - 25, tableY - 70, 25, 70);
      const lampX = w * 0.3;
      const lampY = tableY - 80;
      ctx.fillStyle = '#f0c44a';
      ctx.beginPath();
      ctx.ellipse(lampX, lampY, 30, 18, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#a0c6ff';
      ctx.fillRect(w * 0.42, tableY - 90, 60, 60);
      ctx.fillStyle = '#789ddc';
      ctx.fillRect(w * 0.55, tableY - 70, 60, 40);
      ctx.fillStyle = '#f2f5ff';
      ctx.fillRect(w * 0.64, tableY - 35, 80, 20);

      ctx.strokeStyle = '#4c7be5';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(w * 0.18 + 25, tableY - 40);
      ctx.lineTo(w * 0.3 - 30, tableY - 40);
      ctx.moveTo(w * 0.3 + 30, tableY - 40);
      ctx.lineTo(w * 0.42, tableY - 60);
      ctx.lineTo(w * 0.55, tableY - 50);
      ctx.lineTo(w * 0.64, tableY - 20);
      ctx.lineTo(w * 0.82 - 25, tableY - 40);
      ctx.stroke();

      const total = Math.max(params.r1 + params.r2, 0.2);
      const current = params.voltage / total;
      const dots = 14;
      for (let i = 0; i < dots; i++) {
        const t = (i / dots + params.time * current) % 1;
        const x = w * 0.2 + t * (w * 0.6);
        ctx.fillStyle = '#ff9b45';
        ctx.beginPath();
        ctx.arc(x, tableY - 35, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      const lampBrightness = clamp(current / 0.35, 0, 2.2);
      const lampGlow = ctx.createRadialGradient(lampX, lampY, 15, lampX, lampY, 90);
      lampGlow.addColorStop(0, `rgba(255,230,140,${0.65 * Math.min(1, lampBrightness)})`);
      lampGlow.addColorStop(1, 'rgba(255,230,140,0)');
      ctx.fillStyle = lampGlow;
      ctx.beginPath();
      ctx.arc(lampX, lampY, 80, 0, Math.PI * 2);
      ctx.fill();

      const fanCenterX = w * 0.54;
      const fanCenterY = tableY - 50;
      const fanSpeed = clamp(current * 140, 0, 480);
      ctx.save();
      ctx.translate(fanCenterX, fanCenterY);
      ctx.rotate(params.time * fanSpeed * 0.03);
      ctx.fillStyle = '#f6f8ff';
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.fillRect(0, -4, 32, 10);
      }
      ctx.restore();

      const conveyorY = tableY - 10;
      ctx.fillStyle = '#babeca';
      ctx.fillRect(w * 0.62, conveyorY, w * 0.18, 12);
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(w * 0.62, conveyorY + 6, 10, 0, Math.PI * 2);
      ctx.arc(w * 0.8, conveyorY + 6, 10, 0, Math.PI * 2);
      ctx.stroke();
      const conveyorSpeed = clamp(current * 90, 15, 260);
      for (let i = 0; i < 3; i++) {
        const offset = ((params.time * conveyorSpeed) + i * 60) % (w * 0.18);
        ctx.fillStyle = '#f9cc7a';
        ctx.fillRect(w * 0.62 + offset, conveyorY - 25, 28, 20);
      }

      ctx.fillStyle = '#1f2a44';
      ctx.font = '13px Poppins, sans-serif';
      ctx.fillText('串联灯泡', w * 0.28, tableY - 110);
      ctx.fillText('风扇(电机)', w * 0.44, tableY - 95);
      ctx.fillText('电脑/电阻箱', w * 0.54, tableY - 30);
      ctx.fillText(`I=${current.toFixed(2)}A`, w * 0.65, tableY - 90);
      ctx.fillText(`输送线≈${(conveyorSpeed * 0.05).toFixed(1)} m/s`, w * 0.6, tableY - 55);
      ctx.restore();
    }

    function drawCapacitor(ctx, w, h, params) {
      ctx.save();
      ctx.fillStyle = '#eff4ff';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#d7dee9';
      ctx.fillRect(0, h * 0.25, w, h * 0.75);

      const cameraX = w * 0.25;
      const cameraY = h * 0.55;
      ctx.fillStyle = '#1f243c';
      ctx.fillRect(cameraX - 90, cameraY - 70, 180, 120);
      ctx.fillStyle = '#3a4263';
      ctx.fillRect(cameraX - 110, cameraY - 20, 220, 40);
      ctx.fillStyle = '#101320';
      ctx.beginPath();
      ctx.arc(cameraX + 70, cameraY - 10, 38, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5778d3';
      ctx.beginPath();
      ctx.arc(cameraX + 70, cameraY - 10, 26, 0, Math.PI * 2);
      ctx.fill();

      const capX = w * 0.45;
      const capY = h * 0.5;
      ctx.fillStyle = '#4c7be5';
      ctx.fillRect(capX - 45, capY - 110, 90, 220);
      ctx.fillStyle = '#1f2f56';
      ctx.fillRect(capX - 12, capY - 120, 24, 240);

      const resistanceOhm = params.resistance * 1000;
      const capacitanceF = params.capacitance / 1000;
      const tau = resistanceOhm * capacitanceF;
      const cycle = 7;
      const t = params.time % cycle;
      const chargingPhase = cycle - 1.5;
      let chargeLevel;
      if (t < chargingPhase) {
        const normalized = t / Math.max(chargingPhase, 0.1);
        chargeLevel = 1 - Math.exp(-normalized * (chargingPhase / Math.max(tau, 0.2)));
      } else {
        chargeLevel = Math.max(0, 1 - (t - chargingPhase) * 4);
      }
      chargeLevel = clamp(chargeLevel, 0, 1);
      ctx.fillStyle = `rgba(255,255,255,${0.25 + chargeLevel * 0.6})`;
      ctx.fillRect(capX - 32, capY - 85, 64, 170);

      const ledX = w * 0.68;
      const ledY = h * 0.45;
      ctx.fillStyle = '#1a1d2d';
      ctx.fillRect(ledX - 40, ledY - 30, 80, 60);
      ctx.fillStyle = `rgba(255,100,100,${0.3 + chargeLevel * 0.7})`;
      ctx.beginPath();
      ctx.arc(ledX, ledY, 18, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffae5f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(capX + 80, capY);
      ctx.lineTo(ledX - 60, ledY);
      ctx.lineTo(ledX + 70, ledY);
      ctx.stroke();

      const particles = 16;
      for (let i = 0; i < particles; i++) {
        const progress = (i / particles + chargeLevel * params.time * 0.2) % 1;
        const px = capX + 80 + progress * (ledX - 60 - (capX + 80));
        ctx.fillStyle = `rgba(255,255,255,${0.2 + chargeLevel * 0.6})`;
        ctx.beginPath();
        ctx.arc(px, ledY, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      const flash = t >= chargingPhase;
      if (flash) {
        ctx.fillStyle = `rgba(255,255,255,${chargeLevel})`;
        ctx.fillRect(0, 0, w, h);
      }

      ctx.fillStyle = '#1f2a44';
      ctx.font = '14px Poppins, sans-serif';
      ctx.fillText(`τ ≈ ${(tau).toFixed(2)} s`, capX - 45, capY + 140);
      ctx.fillText(chargeLevel > 0.95 ? '充满 → 准备闪光' : '慢充进行中', capX - 60, capY + 160);
      ctx.restore();
    }

    function drawFuse(ctx, w, h, params) {
      ctx.save();
      ctx.fillStyle = '#f5f7ff';
      ctx.fillRect(0, 0, w, h);
      const tableY = h * 0.7;
      ctx.fillStyle = '#d8e0ef';
      ctx.fillRect(0, tableY, w, h - tableY);

      const current = params.voltage / Math.max(params.load, 0.1);
      const overload = current > params.fuseRating;

      ctx.fillStyle = '#444';
      ctx.fillRect(w * 0.2, tableY - 80, 20, 80);
      ctx.fillRect(w * 0.8 - 20, tableY - 80, 20, 80);

      ctx.strokeStyle = '#4c7be5';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(w * 0.21, tableY - 40);
      ctx.lineTo(w * 0.35, tableY - 40);
      ctx.lineTo(w * 0.5, tableY - 50);
      ctx.lineTo(w * 0.65, tableY - 50);
      ctx.lineTo(w * 0.79, tableY - 40);
      ctx.stroke();

      const fuseX = w * 0.5;
      ctx.fillStyle = '#f6f6f6';
      ctx.fillRect(fuseX - 50, tableY - 65, 100, 30);
      ctx.strokeStyle = '#c8c8c8';
      ctx.strokeRect(fuseX - 50, tableY - 65, 100, 30);

      if (overload) {
        ctx.strokeStyle = '#ff7b4a';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(fuseX - 40, tableY - 50);
        ctx.lineTo(fuseX - 15, tableY - 50 + Math.sin(params.time * 20) * 5);
        ctx.lineTo(fuseX + 10, tableY - 50 - Math.sin(params.time * 15) * 5);
        ctx.lineTo(fuseX + 35, tableY - 50);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,120,60,0.45)';
        ctx.fillRect(fuseX - 50, tableY - 65, 100, 30);
        ctx.fillStyle = `rgba(120,120,120,${0.3 + 0.3 * Math.sin(params.time * 5)})`;
        ctx.beginPath();
        ctx.ellipse(fuseX, tableY - 80, 70, 20, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = '#b0b7c9';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(fuseX - 40, tableY - 50);
        ctx.lineTo(fuseX + 40, tableY - 50);
        ctx.stroke();
      }

      const bulbX = w * 0.7;
      ctx.fillStyle = '#ffd467';
      ctx.beginPath();
      ctx.arc(bulbX, tableY - 70, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffa200';
      ctx.fillRect(bulbX - 10, tableY - 70, 20, 25);
      const bulbGlow = overload ? 0.1 : clamp(current / params.fuseRating, 0, 1);
      const bulbGradient = ctx.createRadialGradient(bulbX, tableY - 70, 10, bulbX, tableY - 70, 80);
      bulbGradient.addColorStop(0, `rgba(255,210,120,${0.5 * bulbGlow})`);
      bulbGradient.addColorStop(1, 'rgba(255,210,120,0)');
      ctx.fillStyle = bulbGradient;
      ctx.beginPath();
      ctx.arc(bulbX, tableY - 70, 80, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#1f2a44';
      ctx.font = '14px Poppins, sans-serif';
      ctx.fillText(`I = ${current.toFixed(2)}A`, w * 0.22, tableY - 100);
      ctx.fillText(`额定 ${params.fuseRating.toFixed(1)}A`, fuseX - 40, tableY - 80);
      ctx.fillText(overload ? '保险丝熔断！' : '电路安全运行', w * 0.6, tableY - 100);
      ctx.restore();
    }

    function drawEnergy(ctx, w, h, params) {
      ctx.save();
      ctx.fillStyle = '#e5f2ff';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#bedc9a';
      ctx.beginPath();
      ctx.moveTo(0, h * 0.8);
      ctx.quadraticCurveTo(w * 0.3, h * 0.5, w * 0.6, h * 0.72);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();

      const towerX = w * 0.25;
      ctx.fillStyle = '#c0c9db';
      ctx.fillRect(towerX - 25, h * 0.2, 50, h * 0.7);

      const heightNorm = params.height / 10;
      const liftHeight = h * 0.75 - heightNorm * 250 - Math.sin(params.time * 1.4) * 8;
      ctx.fillStyle = '#4c7be5';
      ctx.fillRect(towerX - 40, liftHeight - 5, 80, 5);
      ctx.fillStyle = '#ffaf6e';
      ctx.fillRect(towerX - 40, liftHeight - 55, 80, 55);
      ctx.fillStyle = '#f6d0a3';
      ctx.beginPath();
      ctx.arc(towerX, liftHeight - 70, 18, 0, Math.PI * 2);
      ctx.fill();

      const energy = params.mass * g * params.height;
      ctx.fillStyle = '#1f2a44';
      ctx.font = '16px Poppins, sans-serif';
      ctx.fillText(`Ep = mgh = ${energy.toFixed(1)} J`, w * 0.5, h * 0.3);
      ctx.fillText(`m = ${params.mass.toFixed(1)} kg`, w * 0.5, h * 0.34);
      ctx.fillText(`h = ${params.height.toFixed(1)} m`, w * 0.5, h * 0.38);

      ctx.strokeStyle = '#ff9b45';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(towerX + 50, liftHeight);
      ctx.lineTo(towerX + 50, liftHeight + params.height * 10);
      ctx.stroke();
      ctx.restore();
    }

    function drawMomentum(ctx, w, h, params) {
      const trackY = h * 0.78;
      ctx.save();
      ctx.strokeStyle = '#d8e2ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(30, trackY);
      ctx.lineTo(w - 30, trackY);
      ctx.stroke();
      const blockHeight = 55;
      const block1Width = 70;
      const block2Width = 80;
      const cycle = (params.time % 4) / 4;
      const collisionX = w * 0.55;
      let block1X, block2X;
      if (cycle < 0.5) {
        const t = cycle / 0.5;
        block1X = w * 0.15 + t * (collisionX - w * 0.15 - block1Width);
        block2X = w * 0.72;
      } else {
        const t = (cycle - 0.5) / 0.5;
        const v1p = ((params.mass1 - params.mass2) / (params.mass1 + params.mass2)) * params.v1;
        const v2p = (2 * params.mass1 / (params.mass1 + params.mass2)) * params.v1;
        block1X = collisionX - block1Width + v1p * t * 6;
        block2X = w * 0.65 + v2p * t * 5;
      }
      block1X = clamp(block1X, 30, w - block1Width - 30);
      block2X = clamp(block2X, 30, w - block2Width - 30);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#4c7be5';
      roundedRectPath(ctx, block1X, trackY - blockHeight - 10, block1Width, blockHeight, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#ff9b45';
      roundedRectPath(ctx, block2X, trackY - blockHeight - 10, block2Width, blockHeight, 10);
      ctx.fill();
      ctx.stroke();
      drawArrow(ctx, block1X + block1Width / 2, trackY - blockHeight - 25, block1X + block1Width / 2 + params.v1 * 4, trackY - blockHeight - 25, '#4c7be5', 3);
      ctx.restore();
    }

    function drawCircular(ctx, w, h, params) {
      const centerX = w / 2;
      const centerY = h / 2 + 40;
      ctx.save();
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#1d2233');
      bg.addColorStop(1, '#343d58');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#2a2f44';
      ctx.fillRect(0, centerY + 70, w, h - (centerY + 70));
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      for (let i = 0; i < 5; i++) {
        ctx.fillRect(40 + i * 140, centerY + 80, 100, 8);
      }

      ctx.fillStyle = '#444c66';
      ctx.beginPath();
      ctx.arc(centerX, centerY + 40, 80, Math.PI, 0);
      ctx.lineTo(centerX + 80, centerY + 100);
      ctx.lineTo(centerX - 80, centerY + 100);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffcf7d';
      ctx.beginPath();
      ctx.arc(centerX, centerY - 120, 35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6d88ff';
      ctx.fillRect(centerX - 30, centerY - 120, 60, 110);

      const umbrellaRadius = 120 + params.radius * 6;
      ctx.fillStyle = '#f05b72';
      ctx.beginPath();
      ctx.moveTo(centerX, centerY - 40);
      for (let i = 0; i <= 6; i++) {
        const angle = (i / 6) * Math.PI;
        const x = centerX + umbrellaRadius * Math.cos(angle);
        const y = centerY - 40 - umbrellaRadius * Math.sin(angle);
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();

      const angularSpeed = params.speed * 0.8;
      const dropletCount = 20;
      for (let i = 0; i < dropletCount; i++) {
        const theta = params.time * angularSpeed + (i / dropletCount) * Math.PI * 2;
        const startX = centerX + umbrellaRadius * Math.cos(theta);
        const startY = centerY - 40 + umbrellaRadius * Math.sin(theta);
        const vx = Math.cos(theta) * params.speed * 4;
        const vy = Math.sin(theta) * params.speed * 1.2;
        const life = (params.time * 3 + i) % 1;
        const splashX = startX + vx * 15 * life;
        const splashY = startY + vy * 15 * life;
        const alpha = 1 - life;
        ctx.fillStyle = `rgba(132,200,255,${alpha})`;
        ctx.beginPath();
        ctx.arc(splashX, splashY, 3 + params.speed * 0.2 * (1 - life), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.arc(centerX + 30, centerY - 160, 25, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#9ad5ff';
      for (let i = 0; i < 8; i++) {
        const offset = (params.time * 50 + i * 60) % w;
        ctx.beginPath();
        ctx.arc(offset, centerY + 70, 6, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = '#ffffff';
      ctx.font = '14px Poppins, sans-serif';
      ctx.fillText(`向心加速度 a = v² / r = ${(params.speed * params.speed / params.radius).toFixed(2)} m/s²`, 30, 40);
      ctx.fillText('雨伞甩出的水滴沿切线飞出 → “离心力”只是惯性', 30, 64);
      ctx.restore();
    }

    function drawProjectile(ctx, w, h, params) {
      const groundY = h - 80;
      const margin = 70;
      ctx.save();
      const sky = ctx.createLinearGradient(0, 0, 0, groundY);
      sky.addColorStop(0, '#a6d8ff');
      sky.addColorStop(1, '#eaf7ff');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, groundY);
      ctx.fillStyle = '#b4d28d';
      ctx.fillRect(0, groundY, w, h - groundY);

      // background mountains
      ctx.fillStyle = '#87b6e0';
      ctx.beginPath();
      ctx.moveTo(0, groundY - 180);
      ctx.lineTo(w * 0.2, groundY - 250);
      ctx.lineTo(w * 0.4, groundY - 150);
      ctx.lineTo(w * 0.6, groundY - 260);
      ctx.lineTo(w * 0.8, groundY - 150);
      ctx.lineTo(w, groundY - 220);
      ctx.lineTo(w, groundY);
      ctx.lineTo(0, groundY);
      ctx.closePath();
      ctx.fill();

      const angle = toRad(params.angle);
      const v = params.speed;
      const vx = v * Math.cos(angle);
      const vy = v * Math.sin(angle);
      const totalTime = Math.max(0.2, (vy * 2) / g);
      const range = vx * totalTime;
      const maxHeight = (vy * vy) / (2 * g);
      const scaleX = (w - margin * 2) / Math.max(range, 5);
      const scaleY = (groundY - margin) / Math.max(maxHeight * 1.3, 5);
      const scale = Math.min(scaleX, scaleY);
      const originX = margin;
      const originY = groundY;

      const toCanvas = (x, y) => ({
        x: originX + x * scale,
        y: originY - y * scale
      });

      // runway
      ctx.fillStyle = '#7c5c42';
      ctx.fillRect(originX - 40, originY - 20, 160, 20);
      ctx.fillStyle = '#4b3d2c';
      ctx.fillRect(originX - 60, originY - 10, 200, 10);

      // cannon
      ctx.save();
      ctx.translate(originX, originY - 10);
      ctx.rotate(-angle);
      ctx.fillStyle = '#3d4f88';
      roundedRectPath(ctx, -30, -18, 90, 36, 16);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ff9b45';
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.arc(originX, originY, 48, -angle, 0, false);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px Poppins, sans-serif';
      ctx.fillText(`${params.angle.toFixed(0)}°`, originX + 40 * Math.cos(-angle / 2), originY - 40 * Math.sin(angle / 2));

      // target
      const targetX = originX + Math.min(range * scale * 0.9, w - margin * 1.6);
      const targetY = originY;
      ctx.fillStyle = '#f7f3c1';
      ctx.fillRect(targetX - 20, targetY - 60, 40, 60);
      ctx.fillStyle = '#f36e6e';
      ctx.beginPath();
      ctx.arc(targetX, targetY - 75, 18, 0, Math.PI * 2);
      ctx.fill();

      // trajectory grid
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const gy = groundY - i * 60;
        ctx.moveTo(originX - 20, gy);
        ctx.lineTo(w - margin, gy);
      }
      ctx.stroke();

      ctx.strokeStyle = '#4c7be5';
      ctx.lineWidth = 3;
      ctx.beginPath();
      const segments = 120;
      for (let i = 0; i <= segments; i++) {
        const t = (i / segments) * totalTime;
        const x = vx * t;
        const y = vy * t - 0.5 * g * t * t;
        const { x: drawX, y: drawY } = toCanvas(x, y);
        if (i === 0) ctx.moveTo(drawX, drawY);
        else ctx.lineTo(drawX, drawY);
      }
      ctx.stroke();

      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = 'rgba(76,123,229,0.35)';
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.lineTo(originX + range * scale, originY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#1f2a44';
      ctx.font = '13px Poppins, sans-serif';
      ctx.fillText(`射程≈${range.toFixed(1)} m`, originX + range * scale / 2 - 40, originY + 22);

      const apex = toCanvas(vx * (vy / g), maxHeight);
      ctx.fillStyle = '#ffcc7c';
      ctx.beginPath();
      ctx.arc(apex.x, apex.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1f2a44';
      ctx.fillText('最高点', apex.x - 24, apex.y - 12);

      const progress = params.time % totalTime;
      const px = vx * progress;
      const py = vy * progress - 0.5 * g * progress * progress;
      const projectile = toCanvas(px, Math.max(py, 0));
      ctx.fillStyle = '#ff9b45';
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, 13, 0, Math.PI * 2);
      ctx.fill();

      // trail
      ctx.fillStyle = 'rgba(255,155,69,0.35)';
      for (let i = 1; i <= 10; i++) {
        const t = Math.max(progress - i * 0.05, 0);
        const tx = vx * t;
        const ty = vy * t - 0.5 * g * t * t;
        const spot = toCanvas(tx, Math.max(ty, 0));
        ctx.beginPath();
        ctx.arc(spot.x, spot.y, Math.max(1, 8 - i), 0, Math.PI * 2);
        ctx.fill();
      }

      // velocity vectors at projectile
      drawArrow(ctx, projectile.x, projectile.y, projectile.x + vx * scale * 0.18, projectile.y, '#3cc5ff', 4);
      drawArrow(ctx, projectile.x, projectile.y, projectile.x, projectile.y - vy * scale * 0.12 + g * progress * scale * 0.12, '#ff6b81', 4);
      ctx.fillStyle = '#1f2a44';
      ctx.fillText(`vx=${vx.toFixed(1)} m/s`, projectile.x + 15, projectile.y + 14);
      ctx.fillText(`vy=${(vy - g * progress).toFixed(1)} m/s`, projectile.x - 100, projectile.y - 12);

      // scoreboard
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(w - 220, 40, 180, 110);
      ctx.fillStyle = '#1f2a44';
      ctx.font = '14px Poppins, sans-serif';
      ctx.fillText(`时间 ${progress.toFixed(2)}/${totalTime.toFixed(2)} s`, w - 210, 65);
      ctx.fillText(`最大高度 ${maxHeight.toFixed(1)} m`, w - 210, 88);
      ctx.fillText(`射程 ${range.toFixed(1)} m`, w - 210, 111);
      ctx.fillText(`速度 ${v.toFixed(1)} m/s`, w - 210, 134);

      ctx.restore();
    }

    function drawHarmonic(ctx, w, h, params) {
      ctx.save();
      ctx.fillStyle = '#f1f5ff';
      ctx.fillRect(0, 0, w, h);
      const pivotX = w * 0.5;
      const pivotY = h * 0.15;
      ctx.fillStyle = '#d9dce9';
      ctx.fillRect(pivotX - 60, pivotY - 10, 120, 20);

      const displacement = params.amplitude * Math.sin(params.time * params.frequency * Math.PI);
      const bobX = pivotX + displacement;
      const bobY = h * 0.6;

      ctx.strokeStyle = '#4c7be5';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(pivotX, pivotY);
      ctx.lineTo(bobX, bobY);
      ctx.stroke();

      ctx.fillStyle = '#ff9b45';
      ctx.beginPath();
      ctx.arc(bobX, bobY, 25, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#1f2a44';
      ctx.font = '14px Poppins, sans-serif';
      ctx.fillText(`x(t) = A sin(ωt)`, pivotX - 70, pivotY + 30);
      ctx.restore();
    }

    function drawWave(ctx, w, h, params) {
      ctx.save();
      ctx.fillStyle = '#f0f4ff';
      ctx.fillRect(0, 0, w, h);
      const ropeY = h * 0.6;
      ctx.strokeStyle = '#c9d7ff';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(0, ropeY);
      ctx.lineTo(w, ropeY);
      ctx.stroke();

      const amplitude = params.amplitude;
      const freq = params.frequency;
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#ff9b45';
      ctx.beginPath();
      for (let x = 0; x <= w; x++) {
        const y = ropeY + amplitude * Math.sin((x / 80) * freq * Math.PI - params.time);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.fillStyle = '#1f2a44';
      ctx.font = '14px Poppins, sans-serif';
      ctx.fillText('绳子端点被上下抖动 → 横波沿绳传播', 20, ropeY - 40);
      ctx.restore();
    }

    function drawDoppler(ctx, w, h, params) {
      const roadY = h * 0.65;
      ctx.save();
      ctx.fillStyle = '#f3f7ff';
      ctx.fillRect(0, 0, w, roadY);
      ctx.fillStyle = '#cbd6e7';
      ctx.fillRect(0, roadY, w, h - roadY);

      const ambulanceX = w * 0.2 + Math.sin(params.time * 0.3) * 80;
      ctx.fillStyle = '#ffffff';
      roundedRectPath(ctx, ambulanceX - 60, roadY - 70, 120, 50, 12);
      ctx.fill();
      ctx.fillStyle = '#ff4d4d';
      ctx.fillRect(ambulanceX - 20, roadY - 90, 40, 20);
      ctx.fillStyle = '#1f2a44';
      ctx.beginPath();
      ctx.arc(ambulanceX - 35, roadY - 10, 14, 0, Math.PI * 2);
      ctx.arc(ambulanceX + 35, roadY - 10, 14, 0, Math.PI * 2);
      ctx.fill();

      const baseSpacing = 35;
      const approachSpacing = baseSpacing * (1 - params.sourceSpeed / 200);
      const recedeSpacing = baseSpacing * (1 + params.sourceSpeed / 200);
      ctx.strokeStyle = '#4c7be5';
      ctx.lineWidth = 2;
      for (let i = 1; i <= 6; i++) {
        ctx.beginPath();
        ctx.arc(ambulanceX + i * approachSpacing, roadY - 40, i * approachSpacing, -0.4, 0.4);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ambulanceX - i * recedeSpacing, roadY - 40, i * recedeSpacing, Math.PI - 0.4, Math.PI + 0.4);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawThermal(ctx, w, h, params) {
      ctx.save();
      ctx.fillStyle = '#eff4ff';
      ctx.fillRect(0, 0, w, h);
      const trackY = h * 0.65;

      ctx.fillStyle = '#c3d2ec';
      ctx.fillRect(0, trackY, w, 12);

      const expansion = params.alpha * 1e-6 * params.deltaT;
      const railBase = w * 0.35;
      const railLength = railBase * (1 + expansion * 200);
      const gap = clamp(18 - expansion * 4000, 2, 18);
      ctx.fillStyle = '#d46a32';
      ctx.fillRect(w * 0.2, trackY - 20, railLength, 20);
      ctx.clearRect(w * 0.2 + railLength - gap, trackY - 20, gap, 20);

      ctx.strokeStyle = '#ff9b45';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(w * 0.2, trackY - 32);
      ctx.lineTo(w * 0.2 + railLength - gap, trackY - 32);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w * 0.2 + railLength, trackY - 32);
      ctx.lineTo(w * 0.2 + railLength + 40, trackY - 32);
      ctx.stroke();

      ctx.fillStyle = '#1f2a44';
      ctx.font = '14px Poppins, sans-serif';
      ctx.fillText(`ΔT = ${params.deltaT.toFixed(0)}°C`, w * 0.2, trackY - 70);
      ctx.fillText(`ΔL(1m) ≈ ${(expansion * 1000).toFixed(2)} mm`, w * 0.2, trackY - 50);
      ctx.fillText(`预留缝隙 ≈ ${gap.toFixed(1)} mm`, w * 0.2, trackY - 30);

      ctx.fillStyle = '#ff9b45';
      ctx.fillRect(w * 0.7, trackY - params.deltaT * 0.8, 20, params.deltaT * 0.8);
      ctx.strokeStyle = '#1f2a44';
      ctx.strokeRect(w * 0.7, trackY - 80, 20, 80);
      ctx.fillStyle = '#1f2a44';
      ctx.fillText('温度计', w * 0.68, trackY - 90);
      ctx.restore();
    }

    function drawMagnetic(ctx, w, h, params) {
      const centerX = w * 0.5;
      const centerY = h * 0.45;
      ctx.save();
      ctx.fillStyle = '#f4f7ff';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#d15b5b';
      ctx.fillRect(40, centerY - 80, 50, 160);
      ctx.fillStyle = '#4a6fca';
      ctx.fillRect(w - 90, centerY - 80, 50, 160);

      ctx.strokeStyle = '#cfd8ed';
      ctx.lineWidth = 2;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(90, centerY + i * 25);
        ctx.lineTo(w - 90, centerY + i * 25);
        ctx.stroke();
      }

      const radius = 110;
      const angle = params.time * params.velocity * params.magneticField * 0.2;
      const particleX = centerX + radius * Math.cos(angle);
      const particleY = centerY + radius * Math.sin(angle);
      ctx.fillStyle = '#ff9b45';
      ctx.beginPath();
      ctx.arc(particleX, particleY, 14, 0, Math.PI * 2);
      ctx.fill();

      drawArrow(ctx, particleX, particleY, particleX - Math.sin(angle) * 45, particleY + Math.cos(angle) * 45, '#4c7be5', 4);
      ctx.restore();
    }

    function drawEnergyFlow(ctx, w, h, params) {
      ctx.save();
      ctx.fillStyle = '#f9fbff';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#dde6f5';
      ctx.fillRect(w * 0.05, h * 0.2, w * 0.4, h * 0.6);

      const radiatorX = w * 0.1;
      ctx.fillStyle = '#c7d4ea';
      for (let i = 0; i < 6; i++) {
        ctx.fillRect(radiatorX + i * 30, h * 0.3, 20, h * 0.4);
      }

      const amplitude = params.tempDiff * 4;
      ctx.strokeStyle = '#ff9b45';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let y = 0; y <= h; y += 6) {
        const x = radiatorX + 210 + Math.sin((y / 40) + params.time * 0.8) * amplitude;
        if (y === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = '#1f2a44';
      ctx.font = '14px Poppins, sans-serif';
      ctx.fillText(`温差 ${params.tempDiff.toFixed(0)}°C → 对流更强`, radiatorX + 200, h * 0.3);
      ctx.restore();
    }

    function drawPressure(ctx, w, h, params) {
      const fluidTop = h * 0.2;
      ctx.save();
      ctx.fillStyle = '#e9f4ff';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#b2d9ff';
      ctx.fillRect(w * 0.1, fluidTop, w * 0.8, h * 0.6);

      const pressure = params.density * 1000 * g * params.depth;
      const areaSmall = 0.02;
      const areaLarge = 0.12;
      const outputForce = pressure * areaLarge;
      const lift = clamp(outputForce / 4500, 0, 1.4) * 90;

      const smallX = w * 0.25;
      const largeX = w * 0.7;
      const baseY = fluidTop + h * 0.5;

      ctx.fillStyle = '#f6f7fb';
      ctx.fillRect(smallX - 20, fluidTop - 30, 40, fluidTop - 10);
      ctx.fillRect(largeX - 50, fluidTop - 30, 100, fluidTop - 10);

      ctx.fillStyle = '#4a6fd8';
      ctx.fillRect(smallX - 18, baseY - 40, 36, 40);
      ctx.fillRect(largeX - 60, baseY - lift - 40, 120, 40);

      ctx.fillStyle = '#f1d5b9';
      ctx.beginPath();
      ctx.arc(smallX, baseY - 60 + Math.sin(params.time * 1.5) * 5, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a81e5';
      ctx.fillRect(smallX - 18, baseY - 50, 36, 50);

      ctx.fillStyle = '#d6dceb';
      ctx.fillRect(largeX - 90, baseY - lift - 80, 180, 40);
      ctx.fillStyle = '#4c7be5';
      ctx.beginPath();
      ctx.moveTo(largeX - 80, baseY - lift - 80);
      ctx.lineTo(largeX + 80, baseY - lift - 80);
      ctx.lineTo(largeX + 60, baseY - lift - 120);
      ctx.lineTo(largeX - 60, baseY - lift - 120);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#1f2a44';
      ctx.fillRect(largeX - 50, baseY - lift - 70, 100, 30);

      drawArrow(ctx, smallX, baseY - 60, smallX, baseY - 120, '#ff9b45', 4);
      drawArrow(ctx, largeX, baseY - lift - 40, largeX, baseY - lift - 100, '#ff9b45', 6);

      ctx.fillStyle = '#1f2a44';
      ctx.font = '14px Poppins, sans-serif';
      ctx.fillText(`输入压强 P = ${(pressure / 1000).toFixed(1)} kPa`, w * 0.08, fluidTop - 40);
      ctx.fillText(`输出力 ≈ ${outputForce.toFixed(0)} N`, largeX - 90, baseY - lift - 140);
      ctx.fillText(`利用帕斯卡定律：P 传遍流体 → 大活塞抬起汽车`, w * 0.12, fluidTop + h * 0.62);

      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(w * 0.1, fluidTop + i * 30);
        ctx.lineTo(w * 0.9, fluidTop + i * 30 + Math.sin(params.time + i) * 6);
        ctx.stroke();
      }

      ctx.restore();
    }

    function drawCoulomb(ctx, w, h, params) {
      const leftX = w * 0.3;
      const rightX = w * 0.7;
      const centerY = h * 0.5;
      ctx.save();
      ctx.fillStyle = params.q1 >= 0 ? '#ff7878' : '#4c7be5';
      ctx.beginPath();
      ctx.ellipse(leftX, centerY - 20, 40, 55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '18px Poppins, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(params.q1 >= 0 ? '+' : '-', leftX, centerY - 10);
      ctx.strokeStyle = '#c0894a';
      ctx.beginPath();
      ctx.moveTo(leftX, centerY + 35);
      ctx.lineTo(leftX, centerY + 80);
      ctx.stroke();
      ctx.fillStyle = params.q2 >= 0 ? '#ff7878' : '#4c7be5';
      ctx.beginPath();
      ctx.ellipse(rightX, centerY - 20, 40, 55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(params.q2 >= 0 ? '+' : '-', rightX, centerY - 10);
      ctx.strokeStyle = '#c0894a';
      ctx.beginPath();
      ctx.moveTo(rightX, centerY + 35);
      ctx.lineTo(rightX, centerY + 80);
      ctx.stroke();
      const lines = 6;
      for (let i = -lines; i <= lines; i++) {
        const offset = (i / lines) * 40;
        ctx.strokeStyle = '#fcd6a8';
        ctx.beginPath();
        ctx.moveTo(leftX + 35, centerY + offset);
        ctx.bezierCurveTo(w / 2, centerY + offset + Math.sin(i) * 30, w / 2, centerY + offset - Math.sin(i) * 30, rightX - 35, centerY + offset);
        ctx.stroke();
      }
      const force = kElectro * Math.abs(params.q1 * 1e-6 * params.q2 * 1e-6) / Math.pow(params.distance, 2);
      const direction = params.q1 * params.q2 >= 0 ? -1 : 1;
      const arrowLen = clamp(force * 80, 25, 120);
      drawArrow(ctx, leftX + 35, centerY, leftX + 35 + direction * arrowLen, centerY, '#ff9b45', 4);
      drawArrow(ctx, rightX - 35, centerY, rightX - 35 - direction * arrowLen, centerY, '#ff9b45', 4);
      ctx.restore();
    }

    function drawInduction(ctx, w, h, params) {
      ctx.save();
      ctx.fillStyle = '#f5f3eb';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#d8c7a1';
      ctx.fillRect(0, h * 0.7, w, h * 0.3);

      const coilX = w * 0.45;
      const coilY = h * 0.45;
      ctx.strokeStyle = '#c6792f';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(coilX, coilY, 70, Math.PI / 2, -Math.PI / 2, true);
      ctx.arc(coilX + 20, coilY, 70, -Math.PI / 2, Math.PI / 2, true);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,191,73,0.4)';
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.arc(coilX + 10, coilY, 40 + i * 10, 0, Math.PI * 2);
        ctx.stroke();
      }

      const motion = Math.sin(params.time * params.speed);
      const magnetX = w * 0.25 + motion * 60;
      ctx.fillStyle = '#ff6b6b';
      ctx.fillRect(magnetX - 20, coilY - 60, 40, 60);
      ctx.fillStyle = '#3c6dd0';
      ctx.fillRect(magnetX - 20, coilY, 40, 60);
      ctx.fillStyle = '#ffffff';
      ctx.font = '14px Poppins, sans-serif';
      ctx.fillText('N', magnetX - 8, coilY - 28);
      ctx.fillText('S', magnetX - 8, coilY + 32);

      const pointerBaseX = w * 0.72;
      const pointerBaseY = coilY;
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#8a8f9f';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(pointerBaseX, pointerBaseY, 60, Math.PI * 0.75, Math.PI * 0.25, false);
      ctx.stroke();
      ctx.strokeStyle = '#ff9b45';
      ctx.lineWidth = 3;
      const deflection = clamp(motion * params.turns * 0.2, -0.9, 0.9);
      const angle = Math.PI * 0.75 + deflection;
      ctx.beginPath();
      ctx.moveTo(pointerBaseX, pointerBaseY);
      ctx.lineTo(pointerBaseX + 50 * Math.cos(angle), pointerBaseY + 50 * Math.sin(angle));
      ctx.stroke();

      ctx.fillStyle = '#1f2a44';
      ctx.font = '14px Poppins, sans-serif';
      ctx.fillText('检流计', pointerBaseX - 35, pointerBaseY + 70);
      ctx.fillText('线圈', coilX - 20, coilY + 95);
      ctx.fillText('磁铁快速穿过 → 指针偏转', w * 0.15, h * 0.25);
      ctx.restore();
    }

    const principles = [
      {
        id: 'newton',
        name: '牛顿第二定律',
        category: '力学',
        formula: 'F = m \\times a',
        formulaDetail: '判断合力方向后，把所有力作矢量合成得到 F，再用 F 与质量 m 推算加速度 a；若只沿一维运动，可直接代符号计算。',
        summary: '超市里的“空车 VS 满载车”清楚说明：在相同推力下，质量越大加速越慢。牛顿第二定律把“受力”与“运动状态改变”紧密相连，是分析一切动力学问题的核心工具。',
        teachingPoints: [
          '先画受力图并标注方向，再列 F = m·a 的分量形式。',
          '始终保持单位一致，推荐用牛顿(N)、千克(kg)、米每二次方秒(m/s²)。'
        ],
        formulaSteps: [
          '第一步：列受力方程，明确合力 F 的大小与方向。',
          '第二步：把质量 m 换算成 kg，必要时注意 kg↔g 的换算。',
          '第三步：代入 a = F / m，写出数值与方向说明。'
        ],
        sliders: [
          { id: 'force', label: '拉力 F (N)', min: 1, max: 10, step: 0.5, value: 6, unit: 'N' },
          { id: 'mass', label: '质量 m (kg)', min: 1, max: 5, step: 0.5, value: 2, unit: 'kg' }
        ],
        getDetails: (p) => `实时加速度 a = ${(p.force / p.mass).toFixed(2)} m/s²`,
        practice: {
          prompt: '调节 F 与 m，使加速度达到目标 a*',
          unit: 'm/s²',
          targets: [1.5, 2, 2.5, 3.2, 3.8],
          tolerance: 0.15,
          getCurrent: (p) => p.force / p.mass
        },
        textbook: '参考人民教育出版社《普通高中物理 必修第一册》第2章：教材先进行受力分析，再把合力沿坐标轴分解并代入 F=ma，强调单位统一和矢量方向说明。课堂拓展常结合推箱子、公交起步等实例，帮助学生理解“力越大，加速越快”的规律。',
        draw: drawNewton
      },
      {
        id: 'reaction',
        name: '作用力与反作用力',
        category: '力学',
        formula: '\\vec{F}_{AB} = -\\vec{F}_{BA}',
        formulaDetail: '两个物体相互作用时，成对力大小相等、方向相反，作用在不同物体上。火箭/气球通过喷出气体获得反冲，从而产生加速度。',
        summary: '松开气球口的瞬间，喷出的气体向后，气球向前。牛顿第三定律提醒我们：想要“前进”，就得对外界施加反向推力。',
        teachingPoints: [
          '分清“作用对象”，切勿把一对力画在同一受力图上。',
          '反作用力并不会抵消作用力，它们分别影响两个物体的运动。'
        ],
        sliders: [
          { id: 'pressure', label: '气体压力 (kPa)', min: 1, max: 5, step: 0.2, value: 3, unit: 'kPa' },
          { id: 'mass', label: '气球质量 (g)', min: 5, max: 30, step: 1, value: 12, unit: 'g' }
        ],
        getDetails: (p) => `气流推力≈${(p.pressure * 35).toFixed(1)} N，反作用力等值反向`,
        practice: {
          prompt: '调节气压与气球质量，让加速度≈6 m/s²',
          unit: 'm/s²',
          targets: [6],
          tolerance: 0.3,
          getCurrent: (p) => (p.pressure * 35) / p.mass
        },
        draw: drawActionReaction
      },
      {
        id: 'buoyancy',
        name: '浮力（阿基米德）',
        category: '流体与压强',
        formula: 'F_{浮} = ρ_{液} \\times g \\times V_{排}',
        formulaDetail: '把排开液体的体积换算成立方米，再乘以液体密度与 g，即得向上的浮力。若浮力与重力相等，物体悬浮；若浮力更大，物体上浮。',
        summary: '阿基米德原理说明浮力本质上来自被挤开的液体重量。改变密度或浸入体积，就能判断沉浮与露出液面的高度，是船舶和潜水艇设计的基础。',
        teachingPoints: [
          '比较浮力与重力的大小即可判断运动趋势。',
          '若题目给出漂浮比例，可用 ρ物 / ρ液 = V排 / V总 快速求占比。'
        ],
        formulaSteps: [
          '1) 把体积换算为 m³，密度换算为 kg/m³。',
          '2) 代入 F浮 = ρ液 g V排 求浮力，另算 G = ρ物 g V排。',
          '3) 比较 F浮 与 G，判断上浮/下沉或悬浮。'
        ],
        sliders: [
          { id: 'density', label: '物体密度 ρ (g/cm³)', min: 0.5, max: 2, step: 0.1, value: 0.9, unit: 'g/cm³' },
          { id: 'volume', label: '排开体积 V (L)', min: 0.5, max: 2.5, step: 0.1, value: 1.2, unit: 'L' }
        ],
        getDetails: (p) => {
          const volumeM3 = p.volume / 1000;
          const buoy = 1000 * g * volumeM3;
          const weight = p.density * 1000 * g * volumeM3;
          return `浮力≈${buoy.toFixed(1)}N，重力≈${weight.toFixed(1)}N → ${buoy >= weight ? '上浮' : '下沉'}`;
        },
        practice: {
          prompt: '让浮力与重力几乎相等，体验“悬浮”状态',
          unit: 'N',
          targets: [0],
          tolerance: 0.5,
          type: 'difference',
          targetLabel: '浮力 - 重力 → 0',
          getCurrent: (p) => {
            const volumeM3 = p.volume / 1000;
            const buoy = 1000 * g * volumeM3;
            const weight = p.density * 1000 * g * volumeM3;
            return buoy - weight;
          },
          format: (val) => `${val.toFixed(1)}N`
        },
        textbook: '参考人教版《义务教育物理 八年级下册》浮力章节：教材通过“木块漂浮、铁块下沉”实验推导 F浮=ρ液gV排，并配合“阿基米德原理”历史故事强调浮力来源于排开液体的重量。典型题目会让学生先求排水体积，再比较浮力与重力判断沉浮。',
        draw: drawBuoyancy
      },
      {
        id: 'lever',
        name: '杠杆原理',
        category: '力学',
        formula: 'F_{1} \\times L_{1} = F_{2} \\times L_{2}',
        formulaDetail: '把力和力臂按“力矩=力×到支点的垂直距离”配对，左侧与右侧力矩相等即可平衡。',
        summary: '杠杆告诉我们“省力换距离”。改变力臂长度，家庭中的钳子、撬棍都能轻松放大力量，背后都是同一个力矩守恒思想。',
        teachingPoints: [
          '注意力臂必须是到支点的垂直距离，而不是沿杆子的长度。',
          '若存在多个力，记得分别计算并求和，才能判断转向。'
        ],
        sliders: [
          { id: 'leftForce', label: '左侧力 F₁ (N)', min: 1, max: 10, step: 0.5, value: 4, unit: 'N' },
          { id: 'leftArm', label: '左力臂 L₁ (m)', min: 1, max: 5, step: 0.5, value: 3, unit: 'm' }
        ],
        getDetails: (p) => `右侧平衡力 F₂ = ${(p.leftForce * p.leftArm / 3).toFixed(2)} N (L₂=3m)`,
        practice: {
          prompt: '让右侧需要的平衡力接近 5 N',
          unit: 'N',
          targets: [5],
          tolerance: 0.1,
          getCurrent: (p) => p.leftForce * p.leftArm / 3
        },
        textbook: '参考苏科版《九年级物理》杠杆单元：教材以跷跷板、扳手为案例，强调力臂必须垂直测量，并用“力矩=力×力臂”解释平衡条件 F₁L₁=F₂L₂。课后习题常引导学生判断省力、费力杠杆并计算未知力或力臂。',
        draw: drawLever
      },
      {
        id: 'pressure',
        name: '液体压强（帕斯卡定律）',
        category: '流体与压强',
        formula: 'P = ρ \\times g \\times h',
        formulaDetail: '液体压强只与液体密度、重力加速度及深度有关，容器形状再复杂也遵循同样的垂直传递规律。',
        summary: '帕斯卡定律揭示“压力在液体中向各方向等效传递”。它解释了注射器、省力液压机的放大原理，也是潜水和大坝设计需要重点关注的安全指标。',
        teachingPoints: [
          '压强与深度成正比，因此潜水越深所受压强越大。',
          '若液面受到额外压力（如活塞），整个流体都会同步增加同样的压强。'
        ],
        formulaSteps: [
          '① 把密度写成 kg/m³、深度写成 m；',
          '② 套用 P = ρ g h，必要时加上额外外压；',
          '③ 可换算为 kPa 方便与大气压比较。'
        ],
        sliders: [
          { id: 'density', label: '液体密度 ρ (g/cm³)', min: 0.8, max: 1.3, step: 0.05, value: 1.0, unit: 'g/cm³' },
          { id: 'depth', label: '深度 h (m)', min: 0.5, max: 15, step: 0.5, value: 6, unit: 'm' }
        ],
        getDetails: (p) => {
          const pressure = p.density * 1000 * g * p.depth;
          return `底部压强≈${(pressure / 1000).toFixed(1)} kPa`;
        },
        practice: {
          prompt: '通过调节 ρ 与 h，让底部压强≈120 kPa',
          unit: 'Pa',
          targets: [120000],
          tolerance: 6000,
          targetLabel: '≈120 kPa',
          getCurrent: (p) => p.density * 1000 * g * p.depth,
          format: (val) => `${(val / 1000).toFixed(1)} kPa`
        },
        textbook: '参考湘教版《物理》九年级“压强与液压机”章节：书中用连通器和液压举重机演示 P=ρgh，强调“在同一水平面压强相等”，并通过帕斯卡定律推导小面积输入可放大输出力。实验步骤会记录液面高度、压强表读数并分析安全阀作用。',
        draw: drawPressure
      },
      {
        id: 'reflection',
        name: '光的反射定律',
        category: '光学',
        formula: '∠i = ∠r',
        formulaDetail: '入射角与反射角是以法线为基准的夹角；镜面光滑时几何关系最明显，粗糙表面会产生漫反射。',
        summary: '镜子迷宫里，激光每撞一次镜子都会严格遵守“入射角=反射角”，于是光束能被“折来折去”直到射中目标。抓住法线参照，就能规划多次反射的完整路径。',
        teachingPoints: [
          '构造法线，让角度测量更直观。',
          '光路可逆：反射光折返后会沿原路回到光源。'
        ],
        sliders: [
          { id: 'angle', label: '入射角 θi (°)', min: 0, max: 80, step: 1, value: 35, unit: '°' }
        ],
        getDetails: (p) => `入射角 = 反射角 = ${p.angle.toFixed(0)}°`,
        practice: {
          prompt: '把入射角调到 45° 体验等角反射',
          unit: '°',
          targets: [45],
          tolerance: 1,
          getCurrent: (p) => p.angle
        },
        textbook: '参考北师大版《物理》必修第一册几何光学部分：教材用光束盒实验验证“入射光、反射光、法线在同一平面内，且∠i=∠r”，并提醒学生使用量角器以法线为基准测角。延伸例题包括潜望镜与反光镜设计。',
        draw: drawReflection
      },
      {
        id: 'refraction',
        name: '光的折射定律',
        category: '光学',
        formula: 'n₁ sinθ₁ = n₂ sinθ₂',
        formulaDetail: '根据介质折射率求出折射角：θ₂ = arcsin((n₁ / n₂) sinθ₁)。当入射角过大时可能出现全反射。',
        summary: '厨房水杯中的筷子之所以看起来“折断”，是因为光线在水和空气交界处发生偏折。掌握斯涅尔定律，就能预测光线到底向哪弯。',
        teachingPoints: [
          '画法线并标注折射角，避免把角度画错边。',
          '判断光线是否“向法线靠拢”取决于速度是否变慢。'
        ],
        sliders: [
          { id: 'angle', label: '入射角 θ₁ (°)', min: 0, max: 80, step: 1, value: 30, unit: '°' }
        ],
        getDetails: (p) => {
          const theta2 = Math.asin(clamp((n1 / n2) * Math.sin(toRad(p.angle)), -0.999, 0.999));
          return `折射角 θ₂ ≈ ${(theta2 * 180 / Math.PI).toFixed(1)}°`;
        },
        practice: {
          prompt: '寻找折射角 22° 左右所需的入射角',
          unit: '°',
          targets: [22],
          tolerance: 1,
          getCurrent: (p) => (Math.asin(clamp((n1 / n2) * Math.sin(toRad(p.angle)), -0.999, 0.999)) * 180 / Math.PI)
        },
        textbook: '参考人教版《普通高中物理 必修第二册》第3章：教材用玻璃砖和激光演示折射，推导 n₁sinθ₁=n₂sinθ₂，并讨论水-空气界面“向法线靠拢”或“背离法线”的判断。课本还介绍全反射与光纤通讯的联系，强调材料折射率数据表的使用。',
        draw: drawRefraction
      },
      {
        id: 'ohm',
        name: '欧姆定律',
        category: '电学',
        formula: 'U = I \\times R',
        formulaDetail: '只要知道其中任意两个量即可推得第三个量。注意单位：1V/1Ω = 1A。',
        summary: '欧姆定律让电路分析从“猜测”变成“计算”。无论是灯泡、电脑还是生产线上的直流电机，只要知道电阻和电压，就能估算亮度、转速与发热量。',
        teachingPoints: [
          '串并联电路可先化简总电阻，再应用欧姆定律。',
          '实验中保持导线接触良好，电流表应串联。',
          '课件延伸：电脑、风扇、电灯等负载要核对额定电流后再接入电路。'
        ],
        formulaSteps: [
          'Ⅰ. 如果未知 R，先化简求出等效电阻。',
          'Ⅱ. 根据需要求 I 或 U：I = U/R 或 U = I·R。',
          'Ⅲ. 核对量纲：1V/1Ω = 1A。'
        ],
        sliders: [
          { id: 'voltage', label: '电压 U (V)', min: 1, max: 12, step: 1, value: 6, unit: 'V' },
          { id: 'resistance', label: '电阻 R (Ω)', min: 1, max: 100, step: 1, value: 20, unit: 'Ω' }
        ],
        getDetails: (p) => `电流 I = ${(p.voltage / p.resistance).toFixed(2)} A`,
        practice: {
          prompt: '调节 U 或 R，让电流达到 0.40 A',
          unit: 'A',
          targets: [0.4],
          tolerance: 0.03,
          getCurrent: (p) => p.voltage / p.resistance
        },
        textbook: '参考人民教育出版社《普通高中物理 必修第一册》第4章：欧姆定律实验通过电流表、电压表记录多组数据，绘制 U-I 图像并得到直线关系，进而写出 U=IR。教材强调连线方式、电表量程切换与误差分析，同时联系家电铭牌理解额定电流。',
        draw: drawOhm
      },
      {
        id: 'series',
        name: '简单串联电路',
        category: '电学',
        formula: 'R_{总} = R_{1} + R_{2} + \\cdots',
        formulaDetail: '串联元件相同电流，等效电阻直接相加；路上任一点的电压降与电阻成正比。',
        summary: '串联电路像“流水线”——电流大小处处相等。掌握串联规律，可计算灯泡亮度、风扇转速以及工厂中的串联传感器是否安全运行。',
        teachingPoints: [
          '求电流时先计算总电阻，再代入 I = U / R总。',
          '若想知道某段电压，可按分压关系 U段 = I × R段。',
          '课堂提示：串联接入灯泡+电机时，电流相等，亮度和转速由总电阻决定。'
        ],
        sliders: [
          { id: 'r1', label: '电阻 R₁ (Ω)', min: 1, max: 60, step: 1, value: 15, unit: 'Ω' },
          { id: 'r2', label: '电阻 R₂ (Ω)', min: 1, max: 60, step: 1, value: 30, unit: 'Ω' },
          { id: 'voltage', label: '电压 U (V)', min: 1, max: 12, step: 1, value: 5, unit: 'V' }
        ],
        getDetails: (p) => {
          const total = p.r1 + p.r2;
          const current = p.voltage / total;
          return `总电阻=${total.toFixed(1)}Ω，电流=${current.toFixed(2)}A`;
        },
        practice: {
          prompt: '让总电阻等于 70 Ω，观察电流变化',
          unit: 'Ω',
          targets: [70],
          tolerance: 1,
          getCurrent: (p) => p.r1 + p.r2
        },
        textbook: '参考鲁科版《九年级物理》电路章节：教材将串联电路比作同一路径的水流，列出 R总=R₁+R₂，强调电流处处相等、电压按电阻比值分配。课本实验通过串联灯泡测亮度，并让学生计算各段电压以检验理论。',
        draw: drawSeries
      },
      {
        id: 'capacitor',
        name: '电容充放电（闪光灯）',
        category: '电学',
        formula: 'Q = C \\times U',
        formulaDetail: '电容充电时电流随时间呈指数衰减，时间常数 τ = R · C；放电瞬间可释放强光或脉冲电流。',
        summary: '相机闪光灯会先让电容器缓慢充电，指示灯逐渐变亮；按下快门后电容瞬间释放储能，产生刺眼闪光。',
        teachingPoints: [
          '充电阶段 i(t) = (U/R)·e^{-t/RC}，越大的 R 或 C 充电越慢。',
          '放电阶段能量 W = 0.5 · C · U²，会瞬间转化为光和热。',
          '课本常用此模型解释“慢充快放”的电子闪光电路。'
        ],
        formulaSteps: [
          '① 将 C 换算为法拉 (F)，R 换算为欧姆 (Ω)。',
          '② 求时间常数 τ = R · C，约等于充电 63% 所需时间。',
          '③ 放电时电容电压按 e^{-t/RC} 迅速下降，可估算闪光持续时间。'
        ],
        sliders: [
          { id: 'capacitance', label: '电容 C (mF)', min: 100, max: 800, step: 50, value: 400, unit: 'mF' },
          { id: 'resistance', label: '充电电阻 R (kΩ)', min: 1, max: 20, step: 1, value: 6, unit: 'kΩ' }
        ],
        getDetails: (p) => {
          const tau = (p.resistance * 1000) * (p.capacitance / 1000);
          return `时间常数 τ ≈ ${tau.toFixed(2)} s`;
        },
        practice: {
          prompt: '调出 τ≈2 s 的闪光充电配置',
          unit: 's',
          targets: [2],
          tolerance: 0.2,
          getCurrent: (p) => (p.resistance * 1000) * (p.capacitance / 1000)
        },
        textbook: '相机闪光灯电路由高压电源、电容和氙气灯管组成。按下充电按钮后，电容经限流电阻缓慢充电；指示灯亮起表示电压到达触发阈值。按下快门时，触发器导通，让电容瞬间向氙气灯管放电，快速释放全部能量，形成耀眼闪光。',
        draw: drawCapacitor
      },
      {
        id: 'fuse',
        name: '短路与保险丝熔断',
        category: '电学',
        formula: 'I = \\frac{U}{R}, \\quad P = I^{2} R',
        formulaDetail: '短路时 R 极小，电流远超保险丝额定值，产生的热量 I²R 让细金属丝熔化，从而切断电路。',
        summary: '在实验台上故意短接灯泡，可以看到保险丝瞬间炽热并断开，灯泡立刻熄灭，防止电池或导线被烧坏。',
        teachingPoints: [
          '家用保险丝或断路器按额定电流选择，防止线路过载。',
          '短路意味着负载电阻近似为零，I = U/R 会极大。',
          '课本强调实验时需佩戴护目镜，避免火花和烟雾伤害。'
        ],
        formulaSteps: [
          'Ⅰ. 根据 I = U/R 估算实际电流大小。',
          'Ⅱ. 对比保险丝额定电流 I额，若 I > I额 将在短时间内熔断。',
          'Ⅲ. 熔断后电路开路，灯泡或电机不再通电。'
        ],
        sliders: [
          { id: 'voltage', label: '电源电压 U (V)', min: 3, max: 18, step: 1, value: 9, unit: 'V' },
          { id: 'load', label: '负载等效电阻 R (Ω)', min: 1, max: 40, step: 1, value: 15, unit: 'Ω' },
          { id: 'fuseRating', label: '保险丝额定电流 (A)', min: 0.5, max: 5, step: 0.1, value: 2, unit: 'A' }
        ],
        getDetails: (p) => {
          const current = p.voltage / Math.max(p.load, 0.1);
          return current > p.fuseRating
            ? `I≈${current.toFixed(2)}A > I额 → 熔断`
            : `I≈${current.toFixed(2)}A (安全)`;
        },
        practice: {
          prompt: '让 I 接近额定值但不过载',
          unit: 'A',
          targets: [2],
          tolerance: 0.2,
          getCurrent: (p) => p.voltage / Math.max(p.load, 0.1)
        },
        textbook: '教材中常用“保险丝”说明家庭电路安全原理：当电路短路或负载过多时，电流迅速增大，细金属丝发热熔化并开路，保护其他电器。透明保险丝管方便观察熔断后的烟雾和金属蒸汽痕迹，同时提醒实验要佩戴护目镜。',
        draw: drawFuse
      },
      {
        id: 'coulomb',
        name: '库仑定律',
        category: '静电学',
        formula: 'F = k \\times \\frac{|q_{1} q_{2}|}{r^{2}}',
        formulaDetail: '把电荷换算成库仑 (μC → ×10⁻⁶C)，距离用米，代入常数 k=8.99×10⁹ N·m²/C²，可得静电力大小。正负号决定吸引或排斥。',
        summary: '库仑定律是静电学的“牛顿引力定律”。它告诉我们：两个带电体越近、带电量越大，作用力越显著。学校里的“验电器”就是利用这个原理观察排斥。',
        teachingPoints: [
          '电荷量的符号影响力的方向，大小取绝对值。',
          '常把微库仑换算成库仑再进行计算，避免数量级错误。'
        ],
        formulaSteps: [
          '① 将 μC 转换成 C（×10⁻⁶）。',
          '② 量出 r（米），代入 F = k|q₁q₂|/r²。',
          '③ 判断符号：同号排斥、异号相吸。'
        ],
        sliders: [
          { id: 'q1', label: '电荷 q₁ (μC)', min: -5, max: 5, step: 0.5, value: 3, unit: 'μC' },
          { id: 'q2', label: '电荷 q₂ (μC)', min: -5, max: 5, step: 0.5, value: -2, unit: 'μC' },
          { id: 'distance', label: '间距 r (m)', min: 0.3, max: 1.5, step: 0.1, value: 0.8, unit: 'm' }
        ],
        getDetails: (p) => {
          const force = kElectro * Math.abs(p.q1 * 1e-6 * p.q2 * 1e-6) / Math.pow(p.distance, 2);
          return `静电力≈${force.toFixed(3)} N (${p.q1 * p.q2 >= 0 ? '排斥' : '吸引'})`;
        },
        practice: {
          prompt: '配对 q₁, q₂, r，让静电力接近 0.20 N',
          unit: 'N',
          targets: [0.2],
          tolerance: 0.02,
          getCurrent: (p) => kElectro * Math.abs(p.q1 * 1e-6 * p.q2 * 1e-6) / Math.pow(p.distance, 2),
          format: (val) => `${val.toFixed(2)}N`
        },
        textbook: '参考《普通高中物理 选择性必修 第二册》静电场章节：教材介绍库仑扭秤实验，得出 F=k|q₁q₂|/r²，并讨论真空中的介电常数。例题要求把微库仑换算为库仑，同时分析力的方向与矢量表示，延伸到电场强度和等势面概念。',
        draw: drawCoulomb
      },
      {
        id: 'energy',
        name: '重力势能',
        category: '力学',
        formula: 'E_{p} = m \\times g \\times h',
        formulaDetail: '先确定参考零势能位置，再把质量、重力加速度和高度相乘即可得到储能大小。',
        summary: '势能体现“所处位置蕴含的能量”。储存的势能越多，释放时越能做功。例如水库、水塔以及跳水运动都离不开这一公式。',
        teachingPoints: [
          '高度一定要以同一个参考平面为基准。',
          '若题目给出势能变化，可直接代入 ΔEp = m g Δh。'
        ],
        sliders: [
          { id: 'mass', label: '质量 m (kg)', min: 1, max: 5, step: 0.5, value: 2.5, unit: 'kg' },
          { id: 'height', label: '高度 h (m)', min: 1, max: 10, step: 0.5, value: 6, unit: 'm' }
        ],
        getDetails: (p) => `Ep = ${(p.mass * g * p.height).toFixed(1)} J`,
        practice: {
          prompt: '调整 m、h 让重力势能约等于 150 J',
          unit: 'J',
          targets: [150],
          tolerance: 5,
          getCurrent: (p) => p.mass * g * p.height
        },
        textbook: '参考人教版《物理》必修第一册第3章：书中以举重运动员、蓄水池为例说明势能的参考平面选择，并给出 Ep=mgh 的推导。教材提醒在同一问题中要约定零势能面，练习题常结合能量守恒判断势能与动能的转化。',
        draw: drawEnergy
      },
      {
        id: 'momentum',
        name: '动量守恒',
        category: '力学',
        formula: 'm_{1} v_{1} + m_{2} v_{2} = 常量',
        formulaDetail: '在无外力或外力可忽略时，碰撞前后的动量矢量和相同；把方向用正负号表示即可套用。',
        summary: '动量守恒让碰撞分析更简单：不用思考力的细节，只需关注“碰前=碰后”。这也是火箭喷气推进和冰上推人的原因。',
        teachingPoints: [
          '一维问题用正负号表示方向即可。',
          '若碰撞完全弹性，还可以额外列能量守恒求速度。'
        ],
        sliders: [
          { id: 'mass1', label: '小车 A 质量 (kg)', min: 1, max: 5, step: 0.5, value: 2, unit: 'kg' },
          { id: 'mass2', label: '小车 B 质量 (kg)', min: 1, max: 5, step: 0.5, value: 3, unit: 'kg' },
          { id: 'v1', label: 'A 初速度 (m/s)', min: 1, max: 15, step: 1, value: 8, unit: 'm/s' }
        ],
        getDetails: (p) => {
          const v1p = ((p.mass1 - p.mass2) / (p.mass1 + p.mass2)) * p.v1;
          const v2p = (2 * p.mass1 / (p.mass1 + p.mass2)) * p.v1;
          return `碰后 v₁′≈${v1p.toFixed(2)}m/s, v₂′≈${v2p.toFixed(2)}m/s`;
        },
        practice: {
          prompt: '把两车质量调成近似相等，体验速度“交换”',
          unit: 'kg',
          targets: [0],
          tolerance: 0.1,
          type: 'difference',
          targetLabel: 'm₁ - m₂ → 0',
          getCurrent: (p) => p.mass1 - p.mass2,
          format: (val) => `${val.toFixed(2)}kg`
        },
        textbook: '参考人教版《普通高中物理 必修第二册》第5章动量：教材通过气垫导轨实验验证 m₁v₁+m₂v₂ 恒定，并指出在完全弹性碰撞中速度会“对换”。课本练习鼓励学生使用矢量方向和正负号，理解爆炸、火箭喷气也遵循动量守恒。',
        draw: drawMomentum
      },
      {
        id: 'circular',
        name: '匀速圆周运动',
        category: '力学',
        formula: 'a_{c} = \\frac{v^{2}}{r}',
        formulaDetail: '速度大小不变但方向变化，需要向心加速度；可由 v²/r 或 ω²r 获得。',
        summary: '雨伞快速旋转时，水滴沿切线飞出；真正提供“离心力感觉”的是手臂给水滴的向心力。a_c = v²/r 告诉我们速度越快、半径越小，甩出的水越“猛”。',
        teachingPoints: [
          '向心力并非“额外的力”，而是提供圆周运动所需合力。',
          '半径越小、速度越大，向心加速度越明显。'
        ],
        sliders: [
          { id: 'speed', label: '线速度 v (m/s)', min: 1, max: 20, step: 1, value: 8, unit: 'm/s' },
          { id: 'radius', label: '半径 r (m)', min: 1, max: 10, step: 0.5, value: 4, unit: 'm' }
        ],
        getDetails: (p) => `aₐ = ${(p.speed * p.speed / p.radius).toFixed(2)} m/s²`,
        practice: {
          prompt: '让向心加速度接近 10 m/s²',
          unit: 'm/s²',
          targets: [10],
          tolerance: 0.5,
          getCurrent: (p) => p.speed * p.speed / p.radius
        },
        textbook: '参考沪科版《物理》必修第二册匀速圆周运动章节：教材强调“速度方向时刻改变，需要向心力”，推导 a=v²/r，并配合甩石实验、杯中硬币实验说明向心力来源。例题常将重力、绳拉力或静摩擦提供的向心力联系起来。 ',
        draw: drawCircular
      },
      {
        id: 'projectile',
        name: '斜抛运动',
        category: '力学',
        formula: 'R = \\frac{v^{2} \\sin(2\\theta)}{g}',
        formulaDetail: '把初速度分解为水平与竖直分量，水平匀速、竖直做自由落体；射程与 sin2θ 有关，θ=45°时最远。',
        summary: '只需一次分解，就能预测炮弹、投篮或抛水球的轨迹。了解飞行时间和最大高度后，在竞赛题里也能更快判断相遇和落点。',
        teachingPoints: [
          '注意角度要换算成弧度后再代入三角函数。',
          '同一高度发射和落地时，可直接使用射程公式。'
        ],
        sliders: [
          { id: 'speed', label: '初速度 v (m/s)', min: 5, max: 25, step: 1, value: 15, unit: 'm/s' },
          { id: 'angle', label: '发射角 θ (°)', min: 10, max: 80, step: 1, value: 40, unit: '°' }
        ],
        getDetails: (p) => {
          const angle = toRad(p.angle);
          const range = (p.speed * p.speed * Math.sin(2 * angle)) / g;
          return `射程≈${range.toFixed(1)} m`;
        },
        practice: {
          prompt: '尝试让射程达到 20 m',
          unit: 'm',
          targets: [20],
          tolerance: 1.5,
          getCurrent: (p) => (p.speed * p.speed * Math.sin(2 * toRad(p.angle))) / g
        },
        textbook: '参考人教版《物理》必修第二册第3章抛体运动：教材先分解初速度，再列出水平匀速、竖直自由落体两个方程，推导出射程 R=v²sin2θ/g 与最高点高度。课后题结合投球、炮弹、消防水枪，提醒学生注意角度换算与时间求解。',
        draw: drawProjectile
      },
      {
        id: 'harmonic',
        name: '简谐振动（弹簧）',
        category: '波动与声',
        formula: 'x(t) = A \\sin(ω t + φ)',
        formulaDetail: 'A 决定最大位移，ω = 2πf 决定快慢；弹簧振子满足 F = -kx，从而推得 ω = √(k/m)。',
        summary: '简谐振动是“最简单的周期运动”。用它可以描述摆钟、吉他弦甚至交流电，只要掌握振幅和频率即可理解能量的来回交换。',
        teachingPoints: [
          '位移、速度、加速度之间相差 90° 相位。',
          '能量在动能与势能之间周期转换。'
        ],
        sliders: [
          { id: 'amplitude', label: '振幅 A (px)', min: 20, max: 80, step: 5, value: 40, unit: 'px' },
          { id: 'frequency', label: '频率 f (Hz)', min: 0.5, max: 2, step: 0.1, value: 1.2, unit: 'Hz' }
        ],
        getDetails: (p) => `ω = ${(2 * Math.PI * p.frequency).toFixed(2)} rad/s`,
        practice: {
          prompt: '把振幅设为 60 px，体验能量变化',
          unit: 'px',
          targets: [60],
          tolerance: 1,
          getCurrent: (p) => p.amplitude
        },
        textbook: '参考浙教版《物理》选修“波动”模块：教材用弹簧振子推导 x=A sin(ωt+φ)，并指出 ω=√(k/m)。实验部分要求测量周期、画出位移-时间图像，同时讨论能量在动能与势能之间往返转换，是研究机械波的基础模型。',
        draw: drawHarmonic
      },
      {
        id: 'wave',
        name: '波的叠加',
        category: '波动与声',
        formula: 'y = y_{1} + y_{2}',
        formulaDetail: '同一介质中，多列波的位移可直接相加；若频率或相位不同，会形成干涉条纹或拍频。',
        summary: '波的叠加让我们理解噪声抵消耳机、激光干涉仪的工作方式。学会分析相对相位后，复杂的波形也能分解成简单正弦。',
        teachingPoints: [
          '同相位叠加最强，反相位会抵消。',
          '拍频 f拍 = |f₁ - f₂|，可用来调音。'
        ],
        sliders: [
          { id: 'frequency', label: '频率 f (Hz)', min: 1, max: 5, step: 0.2, value: 2.4, unit: 'Hz' },
          { id: 'amplitude', label: '振幅 A (px)', min: 10, max: 60, step: 5, value: 35, unit: 'px' }
        ],
        getDetails: (p) => `最大叠加振幅≈${(p.amplitude * 1.8).toFixed(1)} px`,
        practice: {
          prompt: '让两列波频率=3 Hz，观察稳定花纹',
          unit: 'Hz',
          targets: [3],
          tolerance: 0.1,
          getCurrent: (p) => p.frequency
        },
        textbook: '参考人教版《普通高中物理 选择性必修 第一册》波动章节：教材用波动示踪仪展示“同一介质中位移可叠加”，推导干涉与拍频公式，并通过水波、声波实验让学生观察相位差。课后题要求画出合成波形并分析加强或相消条件。',
        draw: drawWave
      },
      {
        id: 'doppler',
        name: '多普勒效应',
        category: '波动与声',
        formula: 'f\' = f \\times \\frac{v}{(v \\pm v_{s})}',
        formulaDetail: '声源靠近听者时分母 v - vₛ，频率变高；远离时分母 v + vₛ，频率变低。',
        summary: '救护车呼啸而过的音调变化就是多普勒效应。它不仅用于声学，也帮助天文学家测量星系远离速度。',
        teachingPoints: [
          '区分“声源运动”与“观察者运动”的公式。',
          '光的多普勒会引起“红移/蓝移”，概念一致。'
        ],
        sliders: [
          { id: 'sourceSpeed', label: '声源速度 vₛ (m/s)', min: 0, max: 60, step: 5, value: 20, unit: 'm/s' },
          { id: 'frequency', label: '原频率 f (Hz)', min: 220, max: 660, step: 20, value: 440, unit: 'Hz' }
        ],
        getDetails: (p) => {
          const c = 340;
          const front = p.frequency * (c / (c - p.sourceSpeed));
          const back = p.frequency * (c / (c + p.sourceSpeed));
          return `前方≈${front.toFixed(0)}Hz，后方≈${back.toFixed(0)}Hz`;
        },
        practice: {
          prompt: '将声源速度调到 30 m/s，感受频率增幅',
          unit: 'm/s',
          targets: [30],
          tolerance: 2,
          getCurrent: (p) => p.sourceSpeed
        },
        textbook: '参考北师大版《物理》必修第三册波动章节：教材通过警笛实验和气柱共鸣装置说明多普勒效应，写出 f′=f·v/(v±vₛ)，并讨论声源靠近或远离时的频率变化。高阶内容还扩展到光的红移、雷达测速等应用场景。',
        draw: drawDoppler
      },
      {
        id: 'thermal',
        name: '热胀冷缩',
        category: '热学',
        formula: '\\Delta L = \\alpha \\times L_{0} \\times \\Delta T',
        formulaDetail: '线膨胀系数 α 描述单位长度的伸长率，记得把 ΔT 换成摄氏度或开尔文。',
        summary: '桥梁接缝、铁轨缝隙都与热胀冷缩有关。只要温度升高，固体就会延伸；热胀的量随材质和温差线性增长。',
        teachingPoints: [
          '计算时要将毫米与米统一到同一单位。',
          '若材料复合，可分别计算再求和。'
        ],
        sliders: [
          { id: 'deltaT', label: '温差 ΔT (°C)', min: 0, max: 80, step: 5, value: 30, unit: '°C' },
          { id: 'alpha', label: '线膨胀系数 α (×10⁻⁶/°C)', min: 5, max: 25, step: 1, value: 12, unit: '×10⁻⁶' }
        ],
        getDetails: (p) => `ΔL(1m)≈${(p.alpha * 1e-6 * p.deltaT * 1000).toFixed(2)} mm`,
        practice: {
          prompt: '调节 α 与 ΔT 令 ΔL ≈ 1.2 mm',
          unit: 'mm',
          targets: [1.2],
          tolerance: 0.1,
          getCurrent: (p) => p.alpha * 1e-6 * p.deltaT * 1000
        },
        textbook: '参考粤教版《物理》九年级热学部分：教材通过加热铁环、铁棒实验说明热胀冷缩规律 ΔL=αL₀ΔT，列出不同材料的线膨胀系数表格，并提醒桥梁、铁路需预留伸缩缝。练习题常要求根据温差估算缝隙大小或判断卡死风险。',
        draw: drawThermal
      },
      {
        id: 'energyFlow',
        name: '热对流能量流',
        category: '热学',
        formula: 'Q \\propto \\Delta T',
        formulaDetail: '温差越大，热对流越剧烈；实际计算需考虑面积、流速等因素，这里用波形高度代表热流强度。',
        summary: '在湖面或暖气片旁，你能感到空气缓慢流动。热对流将热能从高温区搬到低温区，是天气与海洋环流的重要驱动力。',
        teachingPoints: [
          '加热底部、上冷下热更容易形成对流。',
          '温差变小或密闭空间对流会被抑制。'
        ],
        sliders: [
          { id: 'tempDiff', label: '温差 ΔT (°C)', min: 5, max: 30, step: 1, value: 12, unit: '°C' }
        ],
        getDetails: (p) => `振幅代表热流强度，ΔT=${p.tempDiff.toFixed(0)}°C`,
        practice: {
          prompt: '把温差设为 20°C，观察热流加剧',
          unit: '°C',
          targets: [20],
          tolerance: 1,
          getCurrent: (p) => p.tempDiff
        },
        textbook: '参考沪科版《物理》八年级“热传递”内容：教材把热对流描述为“密度差导致流体整体流动”，示范暖气片、海陆风的形成过程，并强调温差越大，对流越强。课后探究要求绘制热流线并比较传导、辐射三种方式。',
        draw: drawEnergyFlow
      },
      {
        id: 'magnetic',
        name: '洛伦兹力（带电粒子）',
        category: '电磁与现代物理',
        formula: 'F = q \\times v \\times B \\times \\sin θ',
        formulaDetail: '当速度与磁场垂直时，洛伦兹力大小最大，方向可用左手定则判断，提供向心力让粒子弯曲。',
        summary: '磁场会让带电粒子转弯，这是回旋加速器、显像管偏转的基础。只要记住速度越快、磁场越强，轨迹越紧。',
        teachingPoints: [
          '若速度与磁场平行，洛伦兹力为零。',
          '圆轨道半径 r = m v / (|q| B)，质量越大越难弯。'
        ],
        sliders: [
          { id: 'velocity', label: '速度 v (m/s)', min: 1, max: 20, step: 1, value: 8, unit: 'm/s' },
          { id: 'magneticField', label: '磁感应强度 B (T)', min: 0.1, max: 1, step: 0.1, value: 0.5, unit: 'T' }
        ],
        getDetails: (p) => `F = ${(p.velocity * p.magneticField).toFixed(2)} N (取 q=1C, θ=90°)`,
        practice: {
          prompt: '让洛伦兹力达到 6 N，观察轨迹收紧',
          unit: 'N',
          targets: [6],
          tolerance: 0.3,
          getCurrent: (p) => p.velocity * p.magneticField
        },
        textbook: '参考人教版《普通高中物理 选择性必修 第三册》电磁学单元：教材用带电粒子进入匀强磁场的实验推导 F=qvBsinθ，并说明向心力提供者就是洛伦兹力。书中配有质谱仪、回旋加速器等案例，指导学生根据 q、v、B 计算轨道半径。',
        draw: drawMagnetic
      },
      {
        id: 'induction',
        name: '电磁感应（法拉第）',
        category: '电磁与现代物理',
        formula: '|\\varepsilon| = N \\times \\frac{\\Delta Φ}{\\Delta t}',
        formulaDetail: '线圈内磁通量变化越快，感应电动势越大。ΔΦ 可近似看成 B·A，若磁体移动更快或匝数更多，感应电压随之增加。',
        summary: '发电机、磁悬浮列车都依赖电磁感应：动能→电能的关键就是“磁通变化”。本示意用磁铁穿过线圈来展示电压脉冲的大小。',
        teachingPoints: [
          '只有磁通量变化时才产生感应电动势。',
          '楞次定律说明感应电流方向总是阻碍原变化。'
        ],
        formulaSteps: [
          '1. 先求磁通量 Φ = B·A·cosθ 或其变化量 ΔΦ；',
          '2. 感应电动势大小 |ε| = N · ΔΦ / Δt；',
          '3. 用楞次定律判定方向（本示意用色块提示方向）。'
        ],
        sliders: [
          { id: 'speed', label: '磁体移动速度 (m/s)', min: 0.2, max: 2, step: 0.1, value: 0.8, unit: 'm/s' },
          { id: 'turns', label: '线圈匝数 N', min: 20, max: 150, step: 5, value: 60, unit: '匝' }
        ],
        getDetails: (p) => `感应电动势≈${(p.turns * p.speed * 0.04).toFixed(2)} V (示意)`,
        practice: {
          prompt: '调节速度与匝数，让感应电压≈4 V',
          unit: 'V',
          targets: [4],
          tolerance: 0.3,
          getCurrent: (p) => p.turns * p.speed * 0.04,
          format: (val) => `${val.toFixed(2)}V`
        },
        textbook: '参考人教版《普通高中物理 必修第三册》第6章电磁感应：教材通过移动磁铁与线圈实验发现磁通量变化产生感应电动势，写出 ε=N·ΔΦ/Δt，并引入楞次定律判断电流方向。课本还展示手摇发电机、磁悬浮列车等应用。',
        draw: drawInduction
      }
    ];

    const learningNodes = [
      { id: 'path-mech', label: '力学基础', principles: ['newton', 'lever', 'circular', 'projectile'] },
      { id: 'path-fluid', label: '流体与压强', principles: ['buoyancy', 'pressure'] },
      { id: 'path-energy', label: '能量与功', principles: ['energy', 'energyFlow'] },
      { id: 'path-wave', label: '振动与波', principles: ['harmonic', 'wave', 'doppler'] },
      { id: 'path-optics', label: '几何光学', principles: ['reflection', 'refraction'] },
      { id: 'path-electric', label: '电路入门', principles: ['ohm', 'series', 'capacitor', 'fuse'] },
      { id: 'path-charge', label: '静电与场', principles: ['coulomb'] },
      { id: 'path-magnet', label: '电磁感应', principles: ['magnetic', 'induction'] }
    ];

    const categoryOrder = ['力学', '流体与压强', '光学', '电学', '静电学', '波动与声', '热学', '电磁与现代物理'];

    const canvas = document.getElementById('principleCanvas');
    const ctx = canvas.getContext('2d');
    const outlineContainer = document.getElementById('outlineContainer');
    const sliderContainer = document.getElementById('sliderControls');
    const titleEl = document.getElementById('visualTitle');
    const badgeEl = document.getElementById('visualBadge');
    const summaryText = document.getElementById('summaryText');
    const formulaText = document.getElementById('formulaText');
    const randomBtn = document.getElementById('randomBtn');
    const soundBtn = document.getElementById('soundToggle');
    const pathContainer = document.getElementById('learningPath');
    const practicePrompt = document.getElementById('practicePrompt');
    const practiceStatus = document.getElementById('practiceStatus');
    const practiceValue = document.getElementById('practiceValue');
    const practiceRing = document.getElementById('practiceRing');
    const practiceReset = document.getElementById('practiceReset');
    const practiceExplain = document.getElementById('practiceExplain');
    const navToggle = document.getElementById('navToggle');
    const sidebar = document.querySelector('.sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const sidebarClose = document.getElementById('sidebarClose');
    const textbookBtn = document.getElementById('textbookBtn');
    const textbookModal = document.getElementById('textbookModal');
    const textbookContent = document.getElementById('textbookContent');
    const textbookClose = document.getElementById('textbookClose');

    let currentPrinciple = null;
    let currentParams = {};
    let animationTime = 0;
    const practiceTargets = {};

    function renderOutline() {
      outlineContainer.innerHTML = '';
      const grouped = {};
      principles.forEach((p) => {
        if (!grouped[p.category]) grouped[p.category] = [];
        grouped[p.category].push(p);
      });
      categoryOrder.forEach((cat) => {
        if (!grouped[cat]) return;
        const groupEl = document.createElement('div');
        groupEl.className = 'outline-group';
        const header = document.createElement('button');
        header.className = 'outline-group-header';
        header.innerHTML = `<span><i class="fa-solid fa-caret-down"></i>${cat}</span><i class="fa-solid fa-angles-down"></i>`;
        header.addEventListener('click', () => groupEl.classList.toggle('collapsed'));
        const list = document.createElement('div');
        list.className = 'outline-items';
        grouped[cat].forEach((principle) => {
          const item = document.createElement('button');
          item.className = 'outline-item';
          item.textContent = principle.name;
          item.dataset.id = principle.id;
          item.addEventListener('click', () => {
            setActivePrinciple(principle.id);
            closeSidebarOnMobile();
          });
          list.appendChild(item);
        });
        groupEl.appendChild(header);
        groupEl.appendChild(list);
        outlineContainer.appendChild(groupEl);
      });
    }

    function renderLearningPath() {
      pathContainer.innerHTML = '';
      learningNodes.forEach((node, index) => {
        const btn = document.createElement('button');
        btn.className = 'path-node';
        btn.dataset.nodeId = node.id;
        btn.textContent = node.label;
        btn.addEventListener('click', () => {
          if (node.principles.length) {
            setActivePrinciple(node.principles[0]);
            closeSidebarOnMobile();
          }
        });
        pathContainer.appendChild(btn);
        if (index < learningNodes.length - 1) {
          const arrow = document.createElement('i');
          arrow.className = 'fa-solid fa-arrow-right path-arrow';
          pathContainer.appendChild(arrow);
        }
      });
    }

    function highlightOutline(id) {
      document.querySelectorAll('.outline-item').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.id === id);
      });
    }

    function highlightPath(id) {
      learningNodes.forEach((node) => {
        const btn = document.querySelector(`[data-node-id="${node.id}"]`);
        if (!btn) return;
        btn.classList.toggle('active', node.principles.includes(id));
      });
    }

    function formatSliderValue(slider, value) {
      const decimals = slider.step && slider.step < 1 ? 2 : 0;
      return `${value.toFixed(decimals)} ${slider.unit || ''}`.trim();
    }

    function renderSliders(principle) {
      sliderContainer.innerHTML = '';
      principle.sliders.forEach((slider) => {
        const wrapper = document.createElement('label');
        wrapper.className = 'slider-control';
        const title = document.createElement('span');
        title.textContent = slider.label;
        const input = document.createElement('input');
        input.type = 'range';
        input.min = slider.min;
        input.max = slider.max;
        input.step = slider.step || 1;
        input.value = slider.value;
        const numberInput = document.createElement('input');
        numberInput.type = 'number';
        numberInput.min = slider.min;
        numberInput.max = slider.max;
        numberInput.step = slider.step || 1;
        numberInput.value = slider.value;
        const valueEl = document.createElement('div');
        valueEl.className = 'slider-value';
        currentParams[slider.id] = Number(slider.value);
        valueEl.textContent = formatSliderValue(slider, Number(slider.value));
        const syncValue = (val) => {
          currentParams[slider.id] = val;
          valueEl.textContent = formatSliderValue(slider, val);
          numberInput.value = val;
          input.value = val;
          updateInfo();
        };
        input.addEventListener('input', (e) => {
          syncValue(parseFloat(e.target.value));
        });
        numberInput.addEventListener('input', (e) => {
          const val = parseFloat(e.target.value);
          if (isNaN(val)) return;
          syncValue(clamp(val, slider.min, slider.max));
        });
        const row = document.createElement('div');
        row.className = 'slider-input-row';
        row.appendChild(input);
        row.appendChild(numberInput);
        wrapper.appendChild(title);
        wrapper.appendChild(row);
        wrapper.appendChild(valueEl);
        sliderContainer.appendChild(wrapper);
      });
      updateInfo();
    }

    function ensurePracticeTarget(principle) {
      if (!principle.practice) return null;
      if (!practiceTargets[principle.id]) {
        const targets = principle.practice.targets;
        const target = targets[Math.floor(Math.random() * targets.length)];
        practiceTargets[principle.id] = target;
      }
      return practiceTargets[principle.id];
    }

    function rerollPracticeTarget() {
      if (!currentPrinciple || !currentPrinciple.practice) return;
      const targets = currentPrinciple.practice.targets;
      practiceTargets[currentPrinciple.id] = targets[Math.floor(Math.random() * targets.length)];
      updatePractice();
    }

    function explainPractice() {
      if (!currentPrinciple) return;
      const tips = currentPrinciple.teachingPoints || [];
      const lines = tips.length ? tips.map((t, i) => `${i + 1}. ${t}`).join('\n') : currentPrinciple.summary;
      alert(`教学提示\n————————\n${lines}`);
    }

    function updatePractice() {
      if (!currentPrinciple || !currentPrinciple.practice) return;
      const practice = currentPrinciple.practice;
      const target = ensurePracticeTarget(currentPrinciple);
      const current = practice.getCurrent(currentParams);
      const tolerance = practice.tolerance;
      let diff;
      if (practice.type === 'difference') {
        diff = Math.abs(current);
      } else {
        diff = Math.abs(current - target);
      }
      const progressBase = practice.type === 'difference'
        ? Math.max(tolerance * 3, 1)
        : Math.max(Math.abs(target), tolerance * 4);
      const ratio = clamp(1 - diff / progressBase, 0, 1);
      const circumference = 2 * Math.PI * 34;
      practiceRing.style.strokeDasharray = circumference;
      practiceRing.style.strokeDashoffset = circumference * (1 - ratio);
      practiceValue.textContent = `${Math.round(ratio * 100)}%`;
      const formattedCurrent = practice.format ? practice.format(current) : `${current.toFixed(2)} ${practice.unit || ''}`.trim();
      const formattedDiff = practice.unit ? `${diff.toFixed(2)} ${practice.unit}` : diff.toFixed(2);
      const targetDisplay = practice.type === 'difference'
        ? (practice.targetLabel || `≈0 ${practice.unit || ''}`.trim())
        : `${practice.format ? practice.format(target) : `${target} ${practice.unit || ''}`.trim()}`;
      practicePrompt.textContent = `${practice.prompt} (目标：${targetDisplay})`;
      const success = diff <= tolerance;
      if (success) {
        practiceStatus.textContent = `完成！当前 ${formattedCurrent} 已满足目标要求，继续挑战新的目标吧。`;
        practiceStatus.style.color = '#2da44e';
      } else {
        practiceStatus.textContent = `当前：${formattedCurrent}，与目标差≈${formattedDiff}，继续微调滑块。`;
        practiceStatus.style.color = '#56618a';
      }
    }

    function updateInfo() {
      if (!currentPrinciple) return;
      const detail = currentPrinciple.getDetails ? currentPrinciple.getDetails(currentParams) : '';
      const teachList = currentPrinciple.teachingPoints && currentPrinciple.teachingPoints.length
        ? `<ul class="teach-list">${currentPrinciple.teachingPoints.map((t) => `<li>${t}</li>`).join('')}</ul>`
        : '';
      const detailHtml = detail ? `<span class="detail-extra">${detail}</span>` : '';
      summaryText.innerHTML = `<p class="summary-main">${currentPrinciple.summary}</p>${teachList}${detailHtml}`;
      const formulaDetail = currentPrinciple.formulaDetail || '';
      const formulaSteps = currentPrinciple.formulaSteps && currentPrinciple.formulaSteps.length
        ? `<ul class="formula-extras">${currentPrinciple.formulaSteps.map((step) => `<li>${step}</li>`).join('')}</ul>`
        : '';
      formulaText.innerHTML = `<div class="formula-main math-text">${formatFormula(currentPrinciple.formula)}</div><p class="formula-detail">${formulaDetail}</p>${formulaSteps}`;
      updatePractice();
    }

    function setActivePrinciple(id) {
      const principle = principles.find((p) => p.id === id);
      if (!principle) return;
      currentPrinciple = principle;
      currentParams = {};
      titleEl.textContent = principle.name;
      badgeEl.innerHTML = `<i class="fa-solid fa-layer-group"></i> ${principle.category}`;
      renderSliders(principle);
      highlightOutline(id);
      highlightPath(id);
      updateCanvas();
    }

    function updateCanvas() {
      if (!currentPrinciple) return;
      const ratio = window.devicePixelRatio || 1;
      const displayWidth = canvas.clientWidth;
      const displayHeight = canvas.clientHeight;
      if (canvas.width !== displayWidth * ratio || canvas.height !== displayHeight * ratio) {
        canvas.width = displayWidth * ratio;
        canvas.height = displayHeight * ratio;
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, displayWidth, displayHeight);
      ctx.fillStyle = '#f3f9ff';
      ctx.fillRect(0, 0, displayWidth, displayHeight);
      const drawParams = Object.assign({}, currentParams, { time: animationTime / 1000 });
      currentPrinciple.draw(ctx, displayWidth, displayHeight, drawParams);
      const signature = computeAudioSignature(currentPrinciple.id, drawParams);
      audioEngine.update(signature);
    }

    function animate(time) {
      animationTime = time;
      updateCanvas();
      requestAnimationFrame(animate);
    }

    randomBtn.addEventListener('click', () => {
      randomBtn.classList.add('active');
      setTimeout(() => randomBtn.classList.remove('active'), 400);
      const pick = principles[Math.floor(Math.random() * principles.length)];
      setActivePrinciple(pick.id);
    });
    soundBtn.addEventListener('click', () => {
      const next = !audioEngine.isEnabled();
      audioEngine.setEnabled(next);
      updateSoundButton();
    });

    practiceReset.addEventListener('click', rerollPracticeTarget);
    practiceExplain.addEventListener('click', explainPractice);
    textbookBtn.addEventListener('click', () => {
      if (!currentPrinciple) return;
      textbookContent.innerHTML = buildTextbookContent(currentPrinciple);
      textbookModal.classList.add('open');
    });
    textbookClose.addEventListener('click', closeTextbookModal);
    textbookModal.addEventListener('click', (event) => {
      if (event.target === textbookModal) closeTextbookModal();
    });
    window.addEventListener('resize', () => {
      updateCanvas();
      if (window.innerWidth > MOBILE_BREAKPOINT) {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
      } else {
        document.body.classList.remove('nav-collapsed');
      }
      updateNavToggleIcon();
    });
    navToggle.addEventListener('click', () => {
      if (window.innerWidth <= MOBILE_BREAKPOINT) {
        const open = sidebar.classList.toggle('open');
        sidebarOverlay.classList.toggle('active', open);
      } else {
        document.body.classList.toggle('nav-collapsed');
      }
      updateNavToggleIcon();
    });
    sidebarOverlay.addEventListener('click', closeSidebarOnMobile);
    sidebarClose.addEventListener('click', collapseSidebar);

    function closeSidebarOnMobile() {
      if (window.innerWidth <= MOBILE_BREAKPOINT && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
        updateNavToggleIcon();
      }
    }

    function collapseSidebar() {
      if (window.innerWidth <= MOBILE_BREAKPOINT) {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
      } else {
        document.body.classList.add('nav-collapsed');
      }
      updateNavToggleIcon();
    }

    function updateNavToggleIcon() {
      if (window.innerWidth <= MOBILE_BREAKPOINT) {
        navToggle.innerHTML = sidebar.classList.contains('open')
          ? '<i class="fa-solid fa-xmark"></i>'
          : '<i class="fa-solid fa-bars"></i>';
      } else {
        navToggle.innerHTML = document.body.classList.contains('nav-collapsed')
          ? '<i class="fa-solid fa-bars"></i>'
          : '<i class="fa-solid fa-angles-left"></i>';
      }
    }

    function updateSoundButton() {
      const enabled = audioEngine.isEnabled();
      soundBtn.classList.toggle('active', enabled);
      soundBtn.innerHTML = enabled
        ? '<i class="fa-solid fa-volume-high"></i> 声音开'
        : '<i class="fa-solid fa-volume-xmark"></i> 声音关';
    }

    function closeTextbookModal() {
      textbookModal.classList.remove('open');
    }

    function buildTextbookContent(principle) {
      const lines = [];
      if (principle.summary) lines.push(`<p><strong>概念：</strong>${principle.summary}</p>`);
      if (principle.formulaDetail) lines.push(`<p><strong>公式解析：</strong>${principle.formulaDetail}</p>`);
      if (principle.teachingPoints && principle.teachingPoints.length) {
        lines.push('<p><strong>课本要点：</strong></p><ul>' +
          principle.teachingPoints.map((p) => `<li>${p}</li>`).join('') +
          '</ul>');
      }
      if (principle.textbook) {
        lines.push(`<p>${principle.textbook}</p>`);
      }
      return lines.join('') || '<p>该内容暂未提供课本描述。</p>';
    }

    updateNavToggleIcon();
    updateSoundButton();
    renderOutline();
    renderLearningPath();
    setActivePrinciple('newton');
    requestAnimationFrame(animate);
