// ============================================================
// XỬ LÝ AUDIO LỒNG TIẾNG (thuần, không phụ thuộc Web Audio)
//
// - Đọc/ghi WAV PCM 16-bit (Gemini TTS trả PCM 24 kHz mono)
// - Đo mức âm: đỉnh, RMS, số mẫu bị vỡ (clipping), khoảng lặng đầu/cuối
// - Chuẩn hóa âm lượng về một mức RMS thống nhất, có trần đỉnh + nén mềm
//   -> giọng giữa các đoạn đều nhau, không vỡ tiếng
// - Cắt bớt khoảng lặng thừa đầu/cuối (để khớp thời lượng chính xác)
// - Làm mờ hai đầu (fade) -> không có tiếng "bụp"/click ở ranh giới đoạn
// - Tìm khoảng lặng & cắt một audio nhiều câu thành từng đoạn theo tỷ lệ
//   mong đợi (gộp nhiều đoạn vào một lượt TTS để tiết kiệm yêu cầu)
// ============================================================
(function (root) {
    "use strict";

    const dbToLin = db => Math.pow(10, db / 20);
    const linToDb = x => (x > 0 ? 20 * Math.log10(x) : -Infinity);

    // ---------------- WAV / PCM ----------------
    function base64ToBytes(b64) {
        if (typeof atob === "function") {
            const bin = atob(b64);
            const out = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
            return out;
        }
        return new Uint8Array(Buffer.from(b64, "base64"));
    }

    function pcm16leToFloat(bytes) {
        const n = Math.floor(bytes.length / 2);
        const out = new Float32Array(n);
        const dv = new DataView(bytes.buffer, bytes.byteOffset, n * 2);
        for (let i = 0; i < n; i++) out[i] = dv.getInt16(i * 2, true) / 32768;
        return out;
    }

    // Errors from decodeWav carry code "wav_invalid", so callers can tell them from a bug
    function wavError(message) {
        const e = new Error(message);
        e.code = "wav_invalid";
        return e;
    }

    function decodeWav(input) {
        const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
        const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const tag = (o) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
        if (bytes.length < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw wavError("Không phải file WAV");
        let pos = 12, fmt = null, data = null;
        while (pos + 8 <= bytes.length) {
            const id = tag(pos);
            const size = dv.getUint32(pos + 4, true);
            if (id === "fmt ") {
                if (size < 16 || pos + 24 > bytes.length) throw wavError("WAV có khối fmt bị cắt");
                fmt = { format: dv.getUint16(pos + 8, true), channels: dv.getUint16(pos + 10, true), sampleRate: dv.getUint32(pos + 12, true), bits: dv.getUint16(pos + 22, true) };
            } else if (id === "data") {
                data = bytes.subarray(pos + 8, pos + 8 + Math.min(size, bytes.length - pos - 8));
            }
            pos += 8 + size + (size % 2);
        }
        if (!fmt || !data) throw wavError("WAV thiếu fmt/data");
        // A header this code cannot read is refused, not decoded into noise (1.9.0): sample rate 0
        // or 4 GHz passed and made durations Infinity downstream, float data was read as 16-bit
        if (fmt.format !== 1 && fmt.format !== 0xFFFE) throw wavError(`WAV không phải PCM (định dạng ${fmt.format})`);
        if (fmt.bits !== 16) throw wavError("Chỉ hỗ trợ PCM 16-bit");
        if (!(fmt.channels >= 1 && fmt.channels <= 8)) throw wavError(`WAV có ${fmt.channels} kênh`);
        if (!(fmt.sampleRate >= 4000 && fmt.sampleRate <= 192000)) throw wavError(`WAV có tần số lấy mẫu ${fmt.sampleRate}`);
        const inter = pcm16leToFloat(data);
        if (fmt.channels === 1) return { sampleRate: fmt.sampleRate, samples: inter };
        const n = Math.floor(inter.length / fmt.channels);
        const mono = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            let s = 0;
            for (let c = 0; c < fmt.channels; c++) s += inter[i * fmt.channels + c];
            mono[i] = s / fmt.channels;
        }
        return { sampleRate: fmt.sampleRate, samples: mono };
    }

    function encodeWav(samples, sampleRate) {
        const n = samples.length;
        const buf = new ArrayBuffer(44 + n * 2);
        const dv = new DataView(buf);
        const w = (o, s) => { for (let i = 0; i < 4; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
        w(0, "RIFF"); dv.setUint32(4, 36 + n * 2, true); w(8, "WAVE");
        w(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
        dv.setUint32(24, sampleRate, true); dv.setUint32(28, sampleRate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
        w(36, "data"); dv.setUint32(40, n * 2, true);
        for (let i = 0; i < n; i++) {
            const x = Math.max(-1, Math.min(1, samples[i]));
            dv.setInt16(44 + i * 2, x < 0 ? Math.round(x * 32768) : Math.round(x * 32767), true);
        }
        return new Uint8Array(buf);
    }

    // ---------------- Đo mức âm ----------------
    function frameRms(samples, sr, frameMs = 10) {
        const size = Math.max(1, Math.round(sr * frameMs / 1000));
        const frames = new Float32Array(Math.ceil(samples.length / size));
        for (let f = 0; f < frames.length; f++) {
            let s = 0, c = 0;
            for (let i = f * size; i < Math.min(samples.length, (f + 1) * size); i++) { s += samples[i] * samples[i]; c++; }
            frames[f] = Math.sqrt(s / Math.max(1, c));
        }
        return { frames, size };
    }

    // Ngưỡng lặng tương đối: thấp hơn mức nói điển hình ~30 dB
    function silenceThreshold(frames) {
        const sorted = Array.from(frames).filter(x => x > 1e-5).sort((a, b) => a - b);
        if (!sorted.length) return 1e-4;
        const speech = sorted[Math.floor(sorted.length * 0.9)];
        return Math.max(speech * dbToLin(-30), dbToLin(-60));
    }

    function analyze(samples, sr) {
        let peak = 0, sum = 0, clipped = 0;
        for (let i = 0; i < samples.length; i++) {
            const a = Math.abs(samples[i]);
            if (a > peak) peak = a;
            if (a >= 0.999) clipped++;
            sum += samples[i] * samples[i];
        }
        const { frames, size } = frameRms(samples, sr);
        const th = silenceThreshold(frames);
        let lead = 0; while (lead < frames.length && frames[lead] < th) lead++;
        let trail = 0; while (trail < frames.length - lead && frames[frames.length - 1 - trail] < th) trail++;
        // RMS của phần có tiếng (bỏ khoảng lặng) để so độ to giữa các đoạn
        let vs = 0, vc = 0;
        frames.forEach(f => { if (f >= th) { vs += f * f; vc++; } });
        return {
            duration: samples.length / sr,
            peakDb: linToDb(peak),
            rmsDb: linToDb(Math.sqrt(sum / Math.max(1, samples.length))),
            voicedRmsDb: linToDb(Math.sqrt(vs / Math.max(1, vc))),
            clipped,
            leadingSilence: lead * size / sr,
            trailingSilence: trail * size / sr
        };
    }

    // ---------------- Khoảng lặng ----------------
    function findSilences(samples, sr, opts = {}) {
        const minMs = opts.minMs || 150;
        const { frames, size } = frameRms(samples, sr, 10);
        const th = opts.threshold || silenceThreshold(frames);
        const out = [];
        let s = -1;
        for (let f = 0; f <= frames.length; f++) {
            const quiet = f < frames.length && frames[f] < th;
            if (quiet && s < 0) s = f;
            if (!quiet && s >= 0) {
                if ((f - s) * 10 >= minMs) out.push({ start: s * size / sr, end: Math.min(samples.length, f * size) / sr, dur: (f - s) * 10 / 1000 });
                s = -1;
            }
        }
        return out;
    }

    function trimSilence(samples, sr, keepMs = 30) {
        const a = analyze(samples, sr);
        const keep = keepMs / 1000;
        const from = Math.max(0, Math.floor((a.leadingSilence - keep) * sr));
        const to = Math.min(samples.length, Math.ceil(samples.length - Math.max(0, a.trailingSilence - keep) * sr));
        return to > from ? samples.slice(from, to) : samples.slice();
    }

    // ---------------- Âm lượng & ranh giới ----------------
    // Đưa phần có tiếng về targetDb (RMS), trần đỉnh ceilDb, phần vượt trần nén mềm.
    function normalize(samples, sr, opts = {}) {
        const target = opts.targetDb !== undefined ? opts.targetDb : -19;
        const ceil = dbToLin(opts.ceilDb !== undefined ? opts.ceilDb : -1.5);
        const a = analyze(samples, sr);
        if (!Number.isFinite(a.voicedRmsDb)) return samples.slice();
        let gain = dbToLin(target - a.voicedRmsDb);
        gain = Math.min(gain, dbToLin(18));                      // không khuếch đại tiếng ồn quá mức
        const out = new Float32Array(samples.length);
        const knee = ceil * 0.8;
        for (let i = 0; i < samples.length; i++) {
            let x = samples[i] * gain;
            const ax = Math.abs(x);
            if (ax > knee) {
                // nén mềm: tiệm cận trần, không cắt cứng (không méo gắt)
                const over = (ax - knee) / (ceil - knee);
                x = Math.sign(x) * (knee + (ceil - knee) * Math.tanh(over));
            }
            out[i] = x;
        }
        return out;
    }

    function fade(samples, sr, inMs = 8, outMs = 15) {
        const out = samples.slice();
        const ni = Math.min(out.length, Math.round(sr * inMs / 1000));
        const no = Math.min(out.length, Math.round(sr * outMs / 1000));
        for (let i = 0; i < ni; i++) out[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / ni);
        for (let i = 0; i < no; i++) out[out.length - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / no);
        return out;
    }

    // Bước nhảy biên độ lớn nhất ở hai đầu (click) sau xử lý
    function edgeJump(samples) {
        if (!samples.length) return 0;
        return Math.max(Math.abs(samples[0]), Math.abs(samples[samples.length - 1]));
    }

    // Chuẩn bị một đoạn nói để phát: cắt lặng, chuẩn hóa, fade
    // Rút ngắn khoảng lặng DÀI bên trong câu (giọng kể chuyện của VieNeu ngừng 0,3 đến 0,6 giây
    // ở mỗi dấu phẩy) xuống tối đa maxPause, giữ phần đầu và cuối khoảng lặng (hơi thở, đuôi âm),
    // cắt ở giữa rồi làm mờ hai mép để không có tiếng "tách". Giọng không đổi, chỉ bớt chỗ trống.
    function compressPauses(samples, sr, opts = {}) {
        const maxPause = opts.maxPause != null ? opts.maxPause : 0.22;
        const sil = findSilences(samples, sr, { minMs: Math.round(maxPause * 1000) + 30 })
            .filter(x => x.start > 0.05 && x.end < samples.length / sr - 0.05);   // chỉ khoảng lặng BÊN TRONG
        if (!sil.length) return samples;
        const keep = Math.round(maxPause * sr);
        const fadeN = Math.max(1, Math.round(sr * 0.008));
        const pieces = [];
        let pos = 0, removed = 0;
        for (const x of sil) {
            const a = Math.round(x.start * sr), b = Math.round(x.end * sr);
            const cutFrom = a + Math.floor(keep / 2), cutTo = b - Math.ceil(keep / 2);
            if (cutTo - cutFrom <= fadeN * 2) continue;
            pieces.push(samples.slice(pos, cutFrom));
            pos = cutTo;
            removed += cutTo - cutFrom;
        }
        if (!removed) return samples;
        pieces.push(samples.slice(pos));
        const out = new Float32Array(samples.length - removed);
        let o = 0;
        pieces.forEach((pc, k) => {
            const c = Float32Array.from(pc);
            if (k > 0) for (let i = 0; i < Math.min(fadeN, c.length); i++) c[i] *= i / fadeN;
            if (k < pieces.length - 1) for (let i = 0; i < Math.min(fadeN, c.length); i++) c[c.length - 1 - i] *= i / fadeN;
            out.set(c, o);
            o += c.length;
        });
        return out;
    }

    // Shorten each listed silence { start, end, keep } (seconds) to `keep`, cutting out its middle so
    // the breath and word tails on both sides survive; 8 ms fades at every cut (no clicks).
    function shrinkSilences(samples, sr, list) {
        const fadeN = Math.max(1, Math.round(sr * 0.008));
        const pieces = [];
        let pos = 0, removed = 0;
        for (const x of list.slice().sort((a, b) => a.start - b.start)) {
            const a = Math.round(x.start * sr), b = Math.round(x.end * sr);
            const keep = Math.round(Math.max(0, x.keep) * sr);
            const cutFrom = a + Math.floor(keep / 2), cutTo = b - Math.ceil(keep / 2);
            if (cutFrom < pos || cutTo - cutFrom <= fadeN * 2) continue;
            pieces.push(samples.slice(pos, cutFrom));
            pos = cutTo;
            removed += cutTo - cutFrom;
        }
        if (!removed) return samples;
        pieces.push(samples.slice(pos));
        const out = new Float32Array(samples.length - removed);
        let o = 0;
        pieces.forEach((pc, k) => {
            const c = Float32Array.from(pc);
            if (k > 0) for (let i = 0; i < Math.min(fadeN, c.length); i++) c[i] *= i / fadeN;
            if (k < pieces.length - 1) for (let i = 0; i < Math.min(fadeN, c.length); i++) c[c.length - 1 - i] *= i / fadeN;
            out.set(c, o);
            o += c.length;
        });
        return out;
    }

    // Pause shaping (1.7.6). The voice model stops where the text asks for it and also where it
    // does not (mid-phrase hesitations of 0.15 to 0.4 s, and real phrase breaks the text has no
    // comma for). Nothing is ever lengthened or inserted: only the model's own silences are
    // shortened, so a pause exists only where the voice itself made one.
    //   1. alignStops: every internal stop is placed in the text by its position in voiced time.
    //      Punctuation is matched first (the voice stops at nearly every mark) and those stops then
    //      anchor the others, interpolated between them (a long sentence drifts less)
    //   2. CST_DUB_PROSODY.choose decides which stops are pauses (see dub-prosody.js): punctuation
    //      always, other stops when the boundary is good and the rhythm of the whole sentence needs
    //      it; every other stop is closed to a joint (joinPause)
    // History: 1.6.7 punctuation only; 1.7.2 keyword clause openers, a fixed breath every 4.5 s;
    // 1.7.5 adjunct keywords. Measured on 56 sentences x 5 takes, those lists missed the voice's
    // own stops before "nên", "mà", "sau mỗi", and the fixed breath landed mid-phrase.
    const prosody = () => (root && root.CST_DUB_PROSODY) ||
        (typeof require === "function" ? require("./dub-prosody.js") : null);

    function alignStops(samples, sr, text, opts = {}) {
        const dur = samples.length / sr;
        const sil = findSilences(samples, sr, { minMs: opts.minMs || 90 })
            .filter(x => x.start > 0.05 && x.end < dur - 0.05);
        const P = prosody();
        if (!P) return { sil: [], A: null, voiced: 0 };
        const A = P.analyze(text);
        if (!sil.length) return { sil, A, voiced: 0 };
        const a = analyze(samples, sr);
        const onset = Math.min(a.leadingSilence, sil[0].start);
        const offset = Math.max(dur - a.trailingSilence, sil[sil.length - 1].end);
        let quiet = 0;
        for (const x of sil) { x.vt = Math.max(0, x.start - onset - quiet); quiet += x.end - x.start; x.gap = -1; x.punct = false; }
        const voiced = Math.max(0.1, offset - onset - quiet);
        const total = A.total || 1;
        // 1. punctuation, in order (a stop can serve one mark only)
        let from = 0;
        for (const g of A.gaps) {
            if (!g.punct) continue;
            const want = g.pos / total * voiced;
            const tol = Math.max(0.6, voiced * 0.12);
            let best = -1, bestScore = -Infinity;
            for (let j = from; j < sil.length; j++) {
                const d = Math.abs(sil[j].vt - want);
                if (d > tol) { if (sil[j].vt > want) break; continue; }
                const score = Math.min(0.6, sil[j].dur) - d * 0.8;
                if (score > bestScore) { bestScore = score; best = j; }
            }
            if (best < 0) continue;
            sil[best].gap = g.i; sil[best].punct = true;
            from = best + 1;
        }
        // 2. the other stops, between the anchors around them. Measured on 49 comma stops: voiced
        // time predicts the syllable within 0.28 on average; a near tie goes to the better boundary
        const anchors = [{ vt: 0, pos: 0 }, ...sil.filter(x => x.punct).map(x => ({ vt: x.vt, pos: A.gaps[x.gap].pos })), { vt: voiced, pos: total }];
        for (const x of sil) {
            if (x.punct) continue;
            let k = 0;
            while (k < anchors.length - 2 && anchors[k + 1].vt <= x.vt) k++;
            const p = anchors[k], q = anchors[k + 1];
            const est = p.pos + (x.vt - p.vt) / Math.max(1e-6, q.vt - p.vt) * (q.pos - p.pos);
            // A long stop is almost never inside a word, term or number ("biểu | diễn", "mười | lần")
            // and rarely between two content words ("đáng | kể"): the longer the stop, the more the
            // next gap is preferred. Other gaps only break near ties: the voice does hesitate after
            // "rằng" or "của"
            const pull = 0.3 + 0.9 * Math.max(0, Math.min(1, (x.dur - 0.12) / 0.2));
            let best = -1, bestScore = -Infinity;
            for (const g of A.gaps) {
                const d = Math.abs(g.pos - est);
                if (d > 1.5 || g.pos <= p.pos || g.pos >= q.pos) continue;
                const prior = g.unit ? -1.5 : g.cost >= 20 && !g.punct ? -0.8 : 0.25 * Math.max(-1, Math.min(1.5, g.value));
                const score = -1.2 * d * d + pull * prior;
                if (score > bestScore) { bestScore = score; best = g.i; }
            }
            x.gap = best;
            if (best >= 0 && A.gaps[best].punct) x.punct = true;
        }
        return { sil, A, voiced };
    }

    function shapePauses(samples, sr, text, opts = {}) {
        const maxPause = opts.maxPause != null ? opts.maxPause : 0.4;
        const joinPause = opts.joinPause != null ? opts.joinPause : 0.09;
        const { sil, A, voiced } = alignStops(samples, sr, text, opts);
        if (!sil.length) return { samples, matched: 0, soft: 0, joined: 0, pauses: [] };
        // tight mode (a dense sentence): fewer pauses the text does not ask for, all of them shorter
        // opts.breath: word indices of breathing commas (dub-prosody breathAdded), kept at a breath's length
        const breath = new Set(opts.breath || []);
        const dec = prosody().choose(A, sil.map(x => ({ gap: x.gap, sec: x.vt, dur: x.dur, punct: x.punct, breath: !!x.punct && breath.has(x.gap) })), voiced, { tight: maxPause < 0.2 });
        const list = [], pauses = [];
        let joined = 0, matched = 0, soft = 0;
        sil.forEach((x, j) => {
            let { keep, kind } = dec[j];
            if (keep > 0) { keep = Math.min(x.dur, keep, maxPause); if (kind === "soft") soft++; else matched++; }
            else { keep = Math.min(x.dur, joinPause); if (x.dur > joinPause + 0.02) joined++; }
            pauses.push({ at: +(x.vt / voiced).toFixed(3), dur: +x.dur.toFixed(3), keep: +keep.toFixed(3), kind, gap: x.gap });
            if (x.dur - keep > 0.02) list.push({ start: x.start, end: x.end, keep });
        });
        return { samples: shrinkSilences(samples, sr, list), matched, soft, joined, pauses };
    }

    // ---------------- Spectral noise reduction (1.7.0) ----------------
    // In-place iterative radix-2 FFT (re, im: Float64Array of length n, n a power of two).
    function fft(re, im, inverse) {
        const n = re.length;
        for (let i = 1, j = 0; i < n; i++) {
            let bit = n >> 1;
            for (; j & bit; bit >>= 1) j ^= bit;
            j ^= bit;
            if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
        }
        for (let len = 2; len <= n; len <<= 1) {
            const ang = (inverse ? 2 : -2) * Math.PI / len;
            const wr = Math.cos(ang), wi = Math.sin(ang);
            for (let i = 0; i < n; i += len) {
                let cr = 1, ci = 0;
                for (let k = 0; k < len / 2; k++) {
                    const a = i + k, b = a + len / 2;
                    const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
                    re[b] = re[a] - xr; im[b] = im[a] - xi;
                    re[a] += xr; im[a] += xi;
                    const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
                }
            }
        }
        if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
    }

    // Stationary hiss removal for a TTS take. Some VieNeu voices (Mỹ Duyên: floor -51 dB against
    // -75 dB for Thục Đoan) carry a steady hiss from their reference recording, audible under the
    // words too, where a gate cannot reach. The hiss spectrum is learnt from the take's quietest
    // frames, then every frame gets a per-bin Wiener gain with a decision-directed a-priori SNR
    // (Ephraim-Malah), which is what keeps "musical noise" (the warbly artefact of plain spectral
    // subtraction) away. The gain never goes under -maxDb, and a take whose floor is already far
    // under the speech (a clean voice) is returned untouched.
    function denoise(samples, sr, opts = {}) {
        const N = opts.fftSize || (sr >= 32000 ? 1024 : 512), H = N / 4;
        if (samples.length < N * 4) return { samples, applied: false, reason: "short" };
        const win = new Float64Array(N);
        for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
        const frames = Math.floor((samples.length - N) / H) + 1;
        const bins = N / 2 + 1;
        const mags = [], phs = [];
        const energy = new Float64Array(frames);
        const re = new Float64Array(N), im = new Float64Array(N);
        for (let f = 0; f < frames; f++) {
            for (let i = 0; i < N; i++) { re[i] = samples[f * H + i] * win[i]; im[i] = 0; }
            fft(re, im, false);
            const m = new Float32Array(bins), p = new Float32Array(bins);
            let e = 0;
            for (let k = 0; k < bins; k++) { m[k] = Math.hypot(re[k], im[k]); p[k] = Math.atan2(im[k], re[k]); e += m[k] * m[k]; }
            mags.push(m); phs.push(p); energy[f] = e;
        }
        // noise profile: mean power of the quietest 10% of frames (at least 8)
        const order = Array.from(energy.keys()).sort((a, b) => energy[a] - energy[b]);
        const quiet = order.slice(0, Math.max(8, Math.floor(frames * 0.1)));
        const loud = energy[order[Math.floor(frames * 0.9)]] || 1e-12;
        const floorE = quiet.reduce((a, f) => a + energy[f], 0) / quiet.length;
        const snrDb = 10 * Math.log10(loud / Math.max(1e-20, floorE));
        if (snrDb > (opts.skipAboveDb != null ? opts.skipAboveDb : 50)) return { samples, applied: false, reason: "clean", snrDb };
        // Per-bin noise power (1.7.2): the MEAN over the frames that hold only the take's steady hiss:
        // at least 20 dB under the speech level and within 6 dB of those frames' own median, which
        // leaves out the digital silence at the take's ends and the soft edges of words. 1.7.1 used
        // the 20th percentile of each bin over all frames x 1.6, which sat ~4.5 dB under the true
        // level (a noise bin's power is exponentially distributed; its 20th percentile is 0.22 of the
        // mean), so most of the 1 to 5 kHz hiss between words was taken for signal and kept
        // (measured on Mỹ Duyên: gaps only 2 to 4 dB quieter in that band). With fewer than 8 such
        // frames the old estimate is used.
        const noise = new Float64Array(bins);
        // 1.3: a slight over-estimate, measured to leave fewer flaring bins in the gaps than 1.0
        const bias = opts.noiseBias != null ? opts.noiseBias : 1.3;
        const cand = order.filter(f => energy[f] < loud * 0.01 && energy[f] > loud * 1e-9);
        const ref = cand.length ? energy[cand[cand.length >> 1]] : 0;
        const pure = cand.filter(f => energy[f] > ref * 0.25 && energy[f] < ref * 4);
        if (pure.length >= 8) {
            for (const f of pure) for (let k = 0; k < bins; k++) noise[k] += mags[f][k] * mags[f][k];
            for (let k = 0; k < bins; k++) noise[k] = noise[k] / pure.length * bias;
        } else {
            const col = new Float64Array(frames);
            const q = Math.floor(frames * 0.2);
            for (let k = 0; k < bins; k++) {
                for (let f = 0; f < frames; f++) col[f] = mags[f][k] * mags[f][k];
                col.sort();
                noise[k] = col[q] * 1.6;
            }
        }
        const gMin = dbToLin(-(opts.maxDb != null ? opts.maxDb : 12));
        const alpha = 0.98;
        const prevClean = new Float64Array(bins);
        const out = new Float64Array(samples.length);
        const norm = new Float64Array(samples.length);
        const g = new Float64Array(bins);
        for (let f = 0; f < frames; f++) {
            const m = mags[f];
            for (let k = 0; k < bins; k++) {
                const nk = Math.max(noise[k], 1e-20);
                const post = m[k] * m[k] / nk;                          // a-posteriori SNR
                const prio = alpha * prevClean[k] / nk + (1 - alpha) * Math.max(0, post - 1);
                g[k] = Math.max(gMin, prio / (1 + prio));
            }
            // light smoothing across neighbouring bins
            for (let k = 0; k < bins; k++) {
                const a = g[Math.max(0, k - 1)], c = g[Math.min(bins - 1, k + 1)];
                const gk = Math.max(gMin, 0.25 * a + 0.5 * g[k] + 0.25 * c);
                re[k] = m[k] * gk * Math.cos(phs[f][k]);
                im[k] = m[k] * gk * Math.sin(phs[f][k]);
                prevClean[k] = (m[k] * gk) * (m[k] * gk);
            }
            for (let k = 1; k < N / 2; k++) { re[N - k] = re[k]; im[N - k] = -im[k]; }
            fft(re, im, true);
            for (let i = 0; i < N; i++) { out[f * H + i] += re[i] * win[i]; norm[f * H + i] += win[i] * win[i]; }
        }
        const res = new Float32Array(samples.length);
        for (let i = 0; i < samples.length; i++) res[i] = norm[i] > 1e-6 ? out[i] / norm[i] : samples[i];
        return { samples: res, applied: true, snrDb };
    }

    // Rumble cut (1.7.2): 4th-order Butterworth high-pass, two cascaded biquads (Q 0.541 and 1.307).
    // Mỹ Duyên's reference recording carries a low rumble (20 to 150 Hz, a little bump at 50 Hz)
    // that sits under the words at almost its level in the pauses: her voice has nothing under
    // ~130 Hz, so the band holds only noise, and it eats headroom. At 80 Hz the cut is -16 dB at
    // 50 Hz and -0.1 dB at 130 Hz; male voices use 60 Hz (-0.3 dB at 85 Hz, Thái Sơn's lowest pitch).
    function highPass(samples, sr, hz) {
        if (!(hz > 0) || hz >= sr / 2) return samples;
        let x = samples;
        for (const q of [0.5411961, 1.3065630]) {
            const w0 = 2 * Math.PI * hz / sr, cw = Math.cos(w0), al = Math.sin(w0) / (2 * q), a0 = 1 + al;
            const b0 = (1 + cw) / 2 / a0, b1 = -(1 + cw) / a0, b2 = b0, a1 = -2 * cw / a0, a2 = (1 - al) / a0;
            const y = new Float32Array(x.length);
            let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
            for (let i = 0; i < x.length; i++) {
                const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
                x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
            }
            x = y;
        }
        return x;
    }

    // Whole-take cleanup for a VieNeu take, before it is cut or its pauses are shaped: the rumble
    // cut, then the hiss removal (which leaves a clean take alone). 1.7.2 dropped the gate that ran
    // after this: once the hiss estimate was right it took only ~1.5 dB more off the gaps, and it
    // made the remaining floor rise and fall with the words.
    function cleanTake(samples, sr, opts = {}) {
        const hp = highPass(samples, sr, opts.hpHz != null ? opts.hpHz : 70);
        const dn = denoise(hp, sr, opts);
        return { samples: dn.samples, denoised: !!dn.applied, snrDb: dn.snrDb };
    }

    // True when a take starts already voiced (its first 5 ms within ~20 dB of normal speech level
    // after normalize): the model's first frame is sound. Measured on 17 takes each: Thái Sơn 14,
    // Thục Đoan 5, Mỹ Duyên 0. Such a start gets a 20 ms onset instead of 8 ms, so the first
    // syllable rises like a spoken one instead of switching on.
    function startsVoiced(samples, sr) {
        const n = Math.min(samples.length, Math.round(sr * 0.005));
        let e = 0; for (let i = 0; i < n; i++) e += samples[i] * samples[i];
        return n > 0 && Math.sqrt(e / n) > dbToLin(-40);
    }

    function prepareSpeech(samples, sr, opts = {}) {
        const trimmed = trimSilence(samples, sr, opts.keepMs || 25);
        const norm = normalize(trimmed, sr, opts);
        const fadeIn = opts.fadeInMs || (startsVoiced(norm, sr) ? 20 : 8);
        return fade(norm, sr, fadeIn, opts.fadeOutMs || 18);
    }

    // ---------------- Cắt audio nhiều câu thành từng đoạn ----------------
    // weights: tỷ lệ thời lượng mong đợi của từng đoạn (ví dụ theo số âm tiết).
    // Chọn (n-1) khoảng lặng vừa DÀI vừa gần vị trí mong đợi; quy hoạch động
    // giữ đúng thứ tự. Trả về [{start,end}] (giây) và độ tin cậy.
    function splitBySilence(samples, sr, weights, opts = {}) {
        const n = weights.length;
        const dur = samples.length / sr;
        if (n <= 1) return { parts: [{ start: 0, end: dur }], confidence: 1, method: "single" };
        const sil = findSilences(samples, sr, { minMs: opts.minMs || 120 })
            .filter(s => s.start > 0.05 && s.end < dur - 0.05);
        const total = weights.reduce((a, b) => a + b, 0) || 1;
        const expected = [];
        let acc = 0;
        for (let k = 0; k < n - 1; k++) { acc += weights[k]; expected.push(acc / total * dur); }

        const m = sil.length;
        if (m >= n - 1) {
            const INF = 1e9;
            // dp[k][j]: chi phí tốt nhất khi ranh giới thứ k dùng khoảng lặng j
            const dp = Array.from({ length: n - 1 }, () => new Array(m).fill(INF));
            const back = Array.from({ length: n - 1 }, () => new Array(m).fill(-1));
            const cost = (k, j) => {
                const mid = (sil[j].start + sil[j].end) / 2;
                const posErr = Math.abs(mid - expected[k]) / Math.max(0.5, dur / n);
                return posErr * 3 - Math.min(1.2, sil[j].dur) * 4;   // lặng càng dài càng chắc là ranh giới câu
            };
            for (let j = 0; j < m; j++) dp[0][j] = cost(0, j);
            for (let k = 1; k < n - 1; k++) {
                for (let j = k; j < m; j++) {
                    for (let i = k - 1; i < j; i++) {
                        const c = dp[k - 1][i] + cost(k, j);
                        if (c < dp[k][j]) { dp[k][j] = c; back[k][j] = i; }
                    }
                }
            }
            let bestJ = -1, best = INF;
            for (let j = 0; j < m; j++) if (dp[n - 2][j] < best) { best = dp[n - 2][j]; bestJ = j; }
            if (bestJ >= 0) {
                const picks = [];
                for (let k = n - 2, j = bestJ; k >= 0; k--) { picks.unshift(j); j = back[k][j]; }
                const cuts = picks.map(j => (sil[j].start + sil[j].end) / 2);
                const parts = [];
                let s = 0;
                for (const c of cuts) { parts.push({ start: s, end: c }); s = c; }
                parts.push({ start: s, end: dur });
                const avgErr = cuts.reduce((a, c, k) => a + Math.abs(c - expected[k]), 0) / cuts.length;
                const confidence = Math.max(0, 1 - avgErr / Math.max(0.5, dur / n));
                return { parts, confidence, method: "silence" };
            }
        }
        // Dự phòng: cắt theo tỷ lệ, bám vào khoảng lặng gần nhất nếu có
        const parts = [];
        let s = 0;
        for (const e of expected) {
            const near = sil.reduce((b, x) => (!b || Math.abs((x.start + x.end) / 2 - e) < Math.abs((b.start + b.end) / 2 - e) ? x : b), null);
            const c = near && Math.abs((near.start + near.end) / 2 - e) < 0.6 ? (near.start + near.end) / 2 : e;
            parts.push({ start: s, end: c });
            s = c;
        }
        parts.push({ start: s, end: dur });
        return { parts, confidence: 0.3, method: "proportional" };
    }

    function slice(samples, sr, start, end) {
        return samples.slice(Math.max(0, Math.floor(start * sr)), Math.min(samples.length, Math.ceil(end * sr)));
    }

    const api = {
        base64ToBytes, pcm16leToFloat, decodeWav, encodeWav, analyze, findSilences, trimSilence,
        normalize, fade, edgeJump, prepareSpeech, compressPauses, splitBySilence, slice, dbToLin, linToDb,
        shrinkSilences, alignStops, shapePauses, denoise, fft,
        highPass, cleanTake, startsVoiced
    };
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.CST_DUB_AUDIO = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
