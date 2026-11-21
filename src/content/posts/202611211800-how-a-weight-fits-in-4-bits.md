---
title: How a weight fits in 4 bits
date: '2026-11-21T18:00:00Z'
description: Codebook quantization, step by step, with live figures.
---

<h3 id="codebook">How a weight fits in 4 bits</h3>

<p>Both models are mostly big matrices of weights, and each answer word means reading all of them once (§1: memory bandwidth). In 32-bit floats SmolLM2 alone is 538 MB, twice the iPod's RAM, so every weight has to shrink to a few bits. The trick Whistle uses, codebook quantization, is easiest to follow by starting with plain quantization and then adding four refinements, one for each problem the previous version runs into.</p>

<p><strong>First, plain quantization.</strong> A weight is a number such as 0.137, and a float stores it in 32 bits. Quantization stores a rougher copy instead. Choose a small set of allowed values, called levels, and for each weight remember only which level is nearest. With 16 levels the index fits in 4 bits, an eighth of the 32, so the model shrinks eightfold. The price is precision: every weight moves to its nearest level, and the distance it moves is its rounding error. The simplest set of levels is spread evenly from −<em>m</em> to +<em>m</em>, where <em>m</em> is the largest weight in absolute value. That one number, the scale, is stored alongside so the levels can be turned back into real values.</p>

<p>Slide the number of bits and watch the error. Then add an outlier:</p>

<figure class="widget wide" data-widget="quantize">
  <figcaption><strong>Rounding 40 weights to a few levels.</strong> Dots are the weights, ticks are the levels, and each line shows where a weight rounds to. More bits mean more levels and a smaller error, but a bigger model.</figcaption>
  <div class="sx-controls">
    <label>Bits per weight <input type="range" min="1" max="6" step="1" value="3" data-k="bits"> <output data-o="bits"></output></label>
    <button data-k="outlier" aria-pressed="false">add an outlier</button>
    <button data-act="new">new weights</button>
  </div>
  <svg class="sx-cq" viewBox="0 0 640 150" role="img" aria-label="Weights and evenly spaced quantization levels on a number line"></svg>
  <p class="sx-note sx-readout" aria-live="polite">&nbsp;</p>
</figure>

<p>Adding bits helps, but there is a worse problem. Most weights are small, yet a few are much larger: the "outliers" that <a href="https://arxiv.org/abs/2404.00456">much of the quantization literature</a> is about. Because the levels must reach the largest weight, one outlier stretches them so far apart that the ordinary weights, which all sit near zero, round to the few levels there. The error jumps even though almost no weight changed. With 2 bits there are only 4 levels to begin with, so this hurts most there. A single scale for everything is the weak point.</p>

<p><strong>Step 1: cut each row into groups.</strong> A weight matrix has millions of numbers, and one outlier anywhere would stretch the levels for all of them. So a row is split into groups of 64 weights (128 in Whistle), and each group gets its own scale, so an outlier only spoils its own group. The scale is the group's <a href="https://en.wikipedia.org/wiki/Norm_(mathematics)#Euclidean_norm">length</a> (the square root of the sum of squares), stored once. Inside the group, each weight then only has to say "which of 16 levels am I closest to", and 16 levels take 4 bits.<span class="sidenote-wrap"><label for="sn-3" class="sidenote-number"></label><input type="checkbox" id="sn-3" class="sidenote-toggle"><span class="sidenote">Why groups along a row, and not down a column or in square tiles? A layer computes each output as a dot product along one row, so a scale that is constant over part of a row can be pulled out of the sum and multiplied in once per group. Rows are also read from flash in order, and the rotation in step 2 is shared by every row only when groups line up along it. Tiles are possible (some formats use 128×128 blocks) and need far fewer scales, but one outlier then spoils a much larger block. This project did not measure them.</span></span></p>

<p>To get a feel for what grouping buys, try it on a toy matrix of 12 rows and 64 columns. Slide the number of groups per row up from one (a single scale for the whole row) and watch the rounding error. Here the 16 levels are spread evenly up to the largest weight in each group, the plain scheme from the figure above:</p>

<figure class="widget wide" data-widget="grouping">
  <figcaption><strong>Why weights are grouped.</strong> Each cell is one weight (blue negative, red positive). Black lines are group boundaries, and each group gets its own scale. Click a row to see its scales below the matrix and its rounding error underneath. Turn the outliers off to see how much of the effect they cause.</figcaption>
  <div class="sx-controls">
    <label>Groups per row <input type="range" min="0" max="4" step="1" value="0" data-k="g"> <output data-o="g"></output></label>
    <label><input type="checkbox" checked data-k="out"> outliers</label>
    <button data-act="new">New matrix</button>
  </div>
  <svg class="sx-gr" data-v="w" role="img" aria-label="Heatmap of a toy weight matrix with group boundaries and one scale bar per group for the selected row"></svg>
  <p class="sx-note" data-v="info" aria-live="polite">&nbsp;</p>
  <p class="sx-gcap">Rounding error after 4 bits, per weight (redder is larger)</p>
  <svg class="sx-gr" data-v="e" role="img" aria-label="Heatmap of the rounding error of each weight"></svg>
  <div class="sx-gstore">
    <div class="sx-gbar"><div class="idx"></div><div class="scl"></div></div>
    <p class="sx-note" data-v="store"></p>
  </div>
  <table class="sx-gtab"></table>
</figure>

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

<p>To see the first property at work, try it yourself. Orange is a group of weights as they come, with some outliers mixed in; blue is the same group after rotation. The histograms below the bars show where the values sit on the number line:</p>

<figure class="widget wide" data-widget="spread">
  <figcaption><strong>What rotation does to a group.</strong> Each bar is one weight. Make the group bigger and watch one tall spike turn into many short bars of random sign, then add outliers and watch the pile in the middle turn into a bell. Both rows share one scale, so the heights are directly comparable.</figcaption>
  <div class="sx-controls">
    <label>weights <output data-o="n">64</output> <input type="range" data-k="n" min="1" max="8" value="6" aria-label="Weights in the group (power of two)"></label>
    <label>outliers <output data-o="k">1</output> <input type="range" data-k="k" min="0" max="16" value="1" aria-label="Number of outliers"></label>
    <label>outlier size <output data-o="s">20</output>× <input type="range" data-k="s" min="1" max="50" value="20" aria-label="Outlier size in multiples of a normal weight"></label>
    <button data-act="new">new group</button>
    <button data-act="zoom" aria-pressed="false">zoom each histogram</button>
  </div>
  <svg class="sx-sp" viewBox="0 0 640 330" role="img" aria-label="Bars and histograms of a group of weights before and after rotation"></svg>
  <p class="sx-note sx-readout" aria-live="polite">&nbsp;</p>
</figure>

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

<p>Stored this way, a group of 64 weights takes 64 × 4 bits plus one 32-bit length: 4.5 bits per weight on average, because the one length is shared by all 64. SmolLM2 went from 538 MB to 76 MB, and Whistle is 16.9 MB.</p>

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
