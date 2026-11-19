---
title: How a weight fits in 4 bits
date: '2026-11-21T18:00:00Z'
description: Codebook quantization, step by step, with live figures.
---

<h3 id="codebook">How a weight fits in 4 bits</h3>

<p>Both models are mostly big matrices of weights, and each answer word means reading all of them once (§1: memory bandwidth). In 32-bit floats SmolLM2 alone is 538 MB, twice the iPod's RAM, so every weight has to shrink to a few bits. The trick Whistle uses, codebook quantization, is easiest to follow in four steps.</p>

<p><strong>Step 1: cut each row into groups.</strong> A row of a weight matrix is split into groups of 64 weights (128 in Whistle). Each group gets its own scale, its <a href="https://en.wikipedia.org/wiki/Norm_(mathematics)#Euclidean_norm">length</a> (the square root of the sum of squares), stored once. Inside the group, each weight then only has to say "which of 16 levels am I closest to", and 16 levels take 4 bits.</p>

<p>The catch is the shape of a group. Most weights are small, but some groups have a few much larger ones, the "outliers" that <a href="https://arxiv.org/abs/2404.00456">much of the quantization literature</a> is about. If the levels are spread evenly up to the largest weight, an outlier stretches them so far apart that the ordinary weights round to the few levels near zero. With 2 bits there are only 4 levels to begin with, so this hurts most there.</p>

<p><strong>Step 2: rotate the group.</strong> Before choosing levels, the group is multiplied by a <a href="https://en.wikipedia.org/wiki/Hadamard_matrix">Walsh–Hadamard matrix</a>. That's a square matrix whose entries are all +1 or −1 (divided by √n so it keeps lengths). The 2×2 one is [[1, 1], [1, −1]]. Each bigger one is four copies of the previous one, with the bottom-right copy negated:</p>

<figure class="widget wide" data-widget="hadamard">
  <figcaption><strong>Building a Walsh–Hadamard matrix by doubling.</strong> Blue is +1, red is −1. Pick a size, then click a row to see what it computes.</figcaption>
  <div class="sx-controls"><button data-n="2">2×2</button><button data-n="4">4×4</button><button data-n="8">8×8</button><button data-n="16" aria-pressed="true">16×16</button></div>
  <div class="sx-had"></div>
  <p class="sx-note" aria-live="polite">&nbsp;</p>
</figure>

<p>Two properties make this the right tool:</p>
<ul>
<li><strong>Every output mixes every input.</strong> Each output is a ± sum of all the group's weights. One large weight therefore spreads evenly over all 64 outputs instead of dominating one. Sums of many ± terms tend toward a bell curve (the <a href="https://en.wikipedia.org/wiki/Central_limit_theorem">central limit theorem</a>), so the rotated group looks much more <a href="https://en.wikipedia.org/wiki/Normal_distribution">Gaussian</a> than the original, with no lone extremes. <a href="https://arxiv.org/abs/2402.04396">QuIP#</a> and <a href="https://arxiv.org/abs/2404.00456">QuaRot</a> use the same idea for large models.</li>
<li><strong>It is its own inverse.</strong> The rows are <a href="https://en.wikipedia.org/wiki/Orthogonal_matrix">orthogonal</a> and the matrix is symmetric, so applying it twice gives back the original. Rotating loses nothing.</li>
</ul>

<p><strong>Step 3: snap to a codebook made for bell curves.</strong> Because rotated groups all have roughly the same bell shape (once divided by their length), one set of levels can serve all of them. The levels come from <a href="https://en.wikipedia.org/wiki/Lloyd%27s_algorithm">Lloyd's algorithm</a> run on a Gaussian: dense near zero, where most values are, and sparse in the tails. That set is the codebook. Each weight stores the 4-bit index of its nearest level. With 2 bits there are only 4 levels; Whistle mixes 2- and 4-bit layers.</p>

<figure class="widget wide" data-widget="cq">
  <figcaption><strong>Quantizing one group of 32 weights.</strong> Dots are the values to store, ticks the available levels, and lines show where each value rounds to. Turn rotation and the codebook off to compare with plain evenly spaced levels; the average over 500 random groups is the number to watch.</figcaption>
  <div class="sx-controls">
    <button data-k="rotate" aria-pressed="true">rotate first</button>
    <button data-k="codebook" aria-pressed="true">Gaussian codebook</button>
    <button data-k="heavy" aria-pressed="true">heavy tails (outliers)</button>
    <button data-k="bits4" aria-pressed="false">4 bits (off: 2 bits)</button>
    <button data-act="new">new group</button>
  </div>
  <svg class="sx-cq" viewBox="0 0 640 150" role="img" aria-label="Values and quantization levels on a number line"></svg>
  <p class="sx-note sx-readout" aria-live="polite">&nbsp;</p>
</figure>

<p>What each step buys, measured on random groups of 64 and on SmolLM2's real layers:</p>
<ul>
<li><strong>Rotation</strong> is the big win when a group has outliers. For heavy-tailed groups it halves the error at 4 bits (18% → 9%) and cuts it from 86% to 36% at 2 bits.</li>
<li><strong>The Gaussian codebook</strong> adds a little on top, mostly at 2 bits (36% → 33%). SmolLM2's real layers are closer to Gaussian already: at 2 bits the codebook takes their error from about 40% to 34%; at 4 bits every method lands near 10%.</li>
<li>So at 4 bits most of the measured quality gain for SmolLM2 came from GPTQ (below), and the format's other strength is speed, which is step 4.</li>
</ul>

<p>Stored this way, a group of 64 weights takes 64 × 4 bits plus one 32-bit length: 4.5 bits per weight. SmolLM2 went from 538 MB to 76 MB, and Whistle is 16.9 MB.</p>

<p><strong>Step 4: never rebuild the weights.</strong> To use a weight you'd normally decode it: look up its level, multiply by the length, rotate back. Doing that for 135 million weights per word would be slow. Instead the kernel uses the fact that rotating both sides of a <a href="https://en.wikipedia.org/wiki/Dot_product">dot product</a> doesn't change it. What a layer computes is the weights' dot product with the incoming numbers (the activations), and since the rotation is its own inverse:</p>
<pre>  weights · activations  =  (rotated weights) · (rotated activations)
                         =  length × Σ codebook[index] × (rotated activations)</pre>
<p>So the kernel rotates the <em>activations</em> once per group, and reuses them for every row of the matrix: thousands of rows share one rotation. The weights stay as indices. On the iPod's <a href="https://en.wikipedia.org/wiki/ARM_architecture_family#Advanced_SIMD_(Neon)">NEON</a> unit, one table-lookup instruction (<code>vtbl</code>) turns 8 indices into 8 small integer levels, and multiply-accumulate instructions sum 8 or 16 products at a time.</p>

<p>The rotation itself is cheap thanks to the <a href="https://en.wikipedia.org/wiki/Fast_Walsh%E2%80%93Hadamard_transform">fast Walsh–Hadamard transform</a>. Because the matrix is built by doubling, it can be applied in log₂ n rounds of add-and-subtract on pairs, the same <a href="https://en.wikipedia.org/wiki/Butterfly_diagram">butterfly</a> pattern as the FFT, with no multiplications:</p>

<figure class="widget wide" data-widget="fwht">
  <figcaption><strong>The fast transform on 8 numbers.</strong> Each round replaces pairs (a, b) with (a + b, a − b). Step through the rounds.</figcaption>
  <div class="sx-controls"><button data-act="next">next round ▶</button><button data-act="reset">reset</button></div>
  <div class="sx-fwht"></div>
  <p class="sx-note" aria-live="polite">&nbsp;</p>
</figure>

<p>One more refinement is for SmolLM2 only. Rounding each weight to its nearest level is the simplest choice, but not the best one: the errors of neighbouring weights can add up or cancel out. <a href="https://arxiv.org/abs/2210.17323">GPTQ</a> rounds the weights one at a time and nudges the not-yet-rounded ones to compensate, using statistics of real activations (here, from 40 chat questions). It ran on the Mac in a minute, in the rotated domain, with one GPTQ block per group. <a href="https://en.wikipedia.org/wiki/Perplexity">Perplexity</a> on held-out chats, where lower is better:</p>

<div class="wide"><table>
<thead><tr><th>SmolLM2-135M stored as</th><th class="num">Size</th><th class="num">Perplexity</th></tr></thead>
<tbody>
<tr><td>32-bit floats</td><td class="num">538 MB</td><td class="num">7.2</td></tr>
<tr><td>Before: evenly spaced 4-bit layers, 8-bit embedding</td><td class="num">98 MB</td><td class="num">10.1</td></tr>
<tr><td>4-bit codebook, nearest level</td><td class="num">76 MB</td><td class="num">9.6</td></tr>
<tr><td>4-bit codebook, GPTQ rounding</td><td class="num">76 MB</td><td class="num">8.1–8.9</td></tr>
<tr><td>3-bit codebook</td><td class="num">59–66 MB</td><td class="num">29–81, unusable</td></tr>
</tbody>
</table></div>

<p>The earlier pair, <a href="https://huggingface.co/UsefulSensors/moonshine-tiny">Moonshine Tiny</a> (<a href="https://arxiv.org/abs/2410.15608">paper</a>, 30 MB) and the evenly spaced 4/8-bit SmolLM2 (98 MB), is still supported as a fallback. Whistle matched Moonshine's speed on the iPod with half the memory. On six questions asked by a real voice, Whistle got two right and Moonshine none.</p>

<p>The daemon trims silence before speech recognition. Siri often keeps recording for seconds after you stop, and recognition time grows with audio length. It also skips Siri's end tone. It caches the system prompt and stops after two sentences, as Siri would.</p>
</section>

<section>
