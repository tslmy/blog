---
title: How a weight fits in 4 bits
date: '2026-11-21T18:00:00Z'
description: Codebook quantization, step by step, with live figures.
---

<h3 id="codebook">How a weight fits in 4 bits</h3>

<p>Both models are mostly big matrices of weights, and each answer word means reading all of them once (§1: memory bandwidth). In 32-bit floats SmolLM2 alone is 538 MB, twice the iPod's RAM, so every weight has to shrink to a few bits. The trick Whistle uses, codebook quantization, is easiest to follow by starting with plain quantization and then adding four refinements. Each one fixes a problem the previous version runs into:</p>

<div class="wide"><table>
<thead><tr><th>Stage</th><th>Idea</th><th>Problem it fixes</th></tr></thead>
<tbody>
<tr><td>Plain quantization</td><td>Round each weight to the nearest of a few evenly spaced levels</td><td>Starting point</td></tr>
<tr><td>1. Groups</td><td>Each group of 64 weights gets its own scale</td><td>One outlier stretches the levels for the whole matrix</td></tr>
<tr><td>2. Rotation</td><td>Multiply each group by a Hadamard matrix</td><td>A spike still stretches the levels inside its own group</td></tr>
<tr><td>3. Codebook</td><td>Place the levels for a bell curve, not evenly</td><td>Rotated values are bell-shaped, so even levels waste precision</td></tr>
<tr><td>4. Kernel</td><td>Rotate the activations once, never rebuild the weights</td><td>Decoding 135 million weights per word is too slow</td></tr>
</tbody>
</table></div>

<p id="plain-quantization" data-toc="Plain quantization"><strong>First, plain quantization.</strong> A weight is a number such as 0.137, and a float stores it in 32 bits. Quantization stores a rougher copy instead:</p>
<ul>
<li><strong>Levels.</strong> Choose a small set of allowed values, called levels.</li>
<li><strong>Index.</strong> For each weight, remember only which level is nearest. With \(2^b\) levels the index takes \(b\) bits, so 16 levels take \(b = 4\) bits: an eighth of the 32, and the model shrinks \(32/4 = 8\) times.</li>
<li><strong>Rounding error.</strong> Every weight moves to its nearest level, and the distance it moves is its rounding error. That is the price: precision.</li>
<li><strong>Scale.</strong> The simplest levels are spread evenly from \(-m\) to \(+m\), where \(m\) is the largest weight in absolute value. With \(2^b\) levels the gap between neighbours is \(\mathrm{gap} = \dfrac{2m}{2^b - 1}\), and level number \(k\), counting from 0, is \(-m + k\cdot\mathrm{gap}\). That one number \(m\) is stored alongside, so the levels can be turned back into real values.</li>
</ul>

<p>Slide the number of bits and watch the error. Then add an outlier:</p>

<figure class="widget wide" data-widget="quantize">
  <figcaption><strong>Rounding 40 weights to a few levels.</strong> Dots are the weights, ticks are the levels, and each line shows where a weight rounds to. More bits mean more levels and a smaller error, but a bigger model. Click a dot to see the actual bits of that weight, before and after.</figcaption>
  <div class="sx-controls">
    <label>Bits per weight <input type="range" min="1" max="6" step="1" value="3" data-k="bits"> <output data-o="bits"></output></label>
    <button data-k="outlier" aria-pressed="false">add an outlier</button>
    <button data-act="new">new weights</button>
  </div>
  <svg class="sx-cq" viewBox="0 0 640 182" role="img" aria-label="Weights placed on a value ruler, with evenly spaced quantization levels below, each labelled with its level number"></svg>
  <p class="sx-note sx-readout" aria-live="polite">&nbsp;</p>
  <div class="sx-bits"></div>
</figure>

<p>Adding bits helps, but there is a worse problem: the "outliers" that <a href="https://arxiv.org/abs/2404.00456">much of the quantization literature</a> is about.</p>
<ul>
<li>Most weights are small, yet a few are much larger.</li>
<li>The levels must reach the largest weight, so one outlier stretches them far apart, and the ordinary weights near zero round to just the few levels there.</li>
<li>The error jumps even though almost no weight changed.</li>
<li>With 2 bits there are only 4 levels to begin with, so this hurts most there.</li>
</ul>
<p>A single scale for everything is the weak point.</p>

<p id="step-1" data-toc="Step 1: cut rows into groups"><strong>Step 1: cut each row into groups.</strong></p>
<ul>
<li>A weight matrix has millions of numbers, and one outlier anywhere would stretch the levels for all of them.</li>
<li>So each row is split, from left to right, into groups of 64 consecutive weights (128 in Whistle), and each group gets its own scale. A group never spans rows. An outlier now only spoils its own group.</li>
<li>The scale is a number stored once per group. In the plain scheme it is the group's largest weight, which is what the figure below uses. Whistle stores the group's <a href="https://en.wikipedia.org/wiki/Norm_(mathematics)#Euclidean_norm">length</a>, \(\ell = \sqrt{\textstyle\sum_j w_j^2}\), instead, for reasons that become clear in step 3.</li>
<li>Inside the group, each weight only has to say "which of 16 levels am I closest to", and 16 levels take 4 bits.</li>
</ul>

<details class="detour">
<summary>Detour: what exactly is a group, and why along a row?</summary>

<p>A group is a run of consecutive columns inside one row. It never spans rows, and two rows never share a scale. For a weight matrix \(W\) with \(\mathrm{out}\) rows and \(\mathrm{in}\) columns, and a group size \(G\):</p>
<ul>
<li>Row \(i\), which is one output of the layer, is cut into \(\mathrm{in}/G\) groups, left to right.</li>
<li>Group \(g\) of row \(i\) holds the weights \(W_{i,\,gG}\) to \(W_{i,\,gG+G-1}\).</li>
<li>It has its own scale \(s_{i,g}\), so the whole matrix stores \(\mathrm{out}\times\mathrm{in}/G\) scales.</li>
</ul>
<pre>  row i:   W[i,0] … W[i,G−1] | W[i,G] … W[i,2G−1] | …
           └──── group 0 ────┘ └───── group 1 ─────┘
              scale s[i,0]         scale s[i,1]</pre>

<p><strong>Why along a row.</strong> A layer turns the incoming numbers \(x\) (the activations) into output \(i\) with a dot product along row \(i\):</p>
\[ y_i \;=\; \sum_j W_{ij}\,x_j \]
<p>Each weight is stored as a scale and a level index, \(W_{ij} \approx s_{i,g}\,c_{\mathrm{idx}_{ij}}\), where \(g=\lfloor j/G\rfloor\) is the group that column \(j\) falls in and \(c\) is the list of levels. Put that into the dot product and group the terms by \(g\):</p>
\[ y_i \;=\; \sum_g s_{i,g}\Bigl(\sum_{j\,\in\,g} c_{\mathrm{idx}_{ij}}\,x_j\Bigr) \]
<p>Inside the brackets every term shares the same scale, so the scale comes out of the sum. The inner sum uses only small level values and the activations, and the scale is multiplied in once per group instead of once per weight. Step 2 adds the rotation \(H\), which acts on the \(G\) activations of one column block \(x_g\):</p>
\[ y_i \;=\; \sum_g s_{i,g}\,\bigl(\mathbf{c}_{i,g}\cdot H x_g\bigr) \]
<p>Here \(\mathbf{c}_{i,g}\) is the vector of the \(G\) levels chosen in group \(g\) of row \(i\). The rotated activations \(H x_g\) do not depend on \(i\), so they are computed once per column block and reused by every row. That works because every row cuts its columns at the same places.</p>

<p><strong>Other layouts.</strong> Groups could be shaped differently, and the same formula shows what each shape does:</p>
<div class="wide"><table>
<thead><tr><th>Layout</th><th>Can the scale come out of the sum?</th><th>Notes</th></tr></thead>
<tbody>
<tr><td>Run along a row (used here)</td><td>Yes, one multiply per group</td><td>Contiguous in memory, and the rotated activations are shared by all rows</td></tr>
<tr><td>Strip down a column</td><td>No: each term of the sum comes from a different strip with its own scale</td><td>One multiply per weight, and the reads are scattered</td></tr>
<tr><td>Square tile (some formats use 128×128)</td><td>Yes, once per row of the tile</td><td>Far fewer scales, but one outlier spoils a much larger block. This project did not measure it</td></tr>
</tbody>
</table></div>
</details>

<p>To get a feel for what grouping buys, try it on a toy matrix of 12 rows and 64 columns. Slide the number of groups per row up from one (a single scale for the whole row) and watch the rounding error. Here the 16 levels are spread evenly up to the largest weight in each group, the plain scheme from the figure above:</p>

<figure class="widget wide" data-widget="grouping">
  <figcaption><strong>Why weights are grouped.</strong> Each cell is one weight (blue negative, red positive). White lines separate the rows and the groups within each row, and each group gets its own scale: the number printed on its cells, which is its largest weight (the plain scheme; Whistle uses the group's length instead). Every row has its own groups and scales. Outliers have a gold outline, and a group that contains one is outlined in the scales heatmap. Slide "Groups with outliers" down to 0 to see how much of the effect they cause. An outlier's size is a multiple of a typical weight.</figcaption>
  <div class="sx-controls">
    <label>Groups per row <input type="range" min="0" max="4" step="1" value="0" data-k="g"> <output data-o="g"></output></label>
    <label>Groups with outliers <input type="range" min="0" max="12" step="1" value="6" data-k="nout"> <output data-o="nout"></output></label>
    <label>Outlier size <input type="range" min="2" max="16" step="1" value="8" data-k="osize"> <output data-o="osize"></output></label>
    <button data-act="new">New matrix</button>
  </div>
  <svg class="sx-gr" data-v="w" role="img" aria-label="Heatmap of a toy weight matrix with group boundaries and each group's scale printed on its cells"></svg>
  <p class="sx-gcap">Scale of each group, its largest weight (the more gold, the larger). An outline marks a group that contains an outlier.</p>
  <svg class="sx-gr" data-v="s" role="img" aria-label="Heatmap of the scale of each group in each row"></svg>
  <p class="sx-note" data-v="info" aria-live="polite">&nbsp;</p>
  <p class="sx-gcap">Rounding error after 4 bits, per weight (redder is larger)</p>
  <svg class="sx-gr" data-v="e" role="img" aria-label="Heatmap of the rounding error of each weight"></svg>
  <div class="sx-gstore">
    <div class="sx-gbar"><div class="idx"></div><div class="scl"></div></div>
    <p class="sx-note" data-v="store"></p>
  </div>
  <table class="sx-gtab"></table>
</figure>

<p id="step-2" data-toc="Step 2: rotate the group"><strong>Step 2: rotate the group.</strong> Grouping stops an outlier from spoiling its whole row, but inside its own group it still stretches the levels for the other 63 weights.</p>
<p>Here are the groups from the figure above, split into those that contain an outlier and the rest. Each dot is one group, and the tick marks the average:</p>

<figure class="widget wide" data-widget="outlierloss">
  <figcaption><strong>Groups with an outlier lose more.</strong> It follows the matrix and the groups per row you chose above, and "New matrix", "Groups with outliers" and "Outlier size" change it too.</figcaption>
  <svg class="sx-ol" viewBox="0 0 640 200" role="img" aria-label="Average rounding error of each group, split into the first half of the groups, closer to an axis, and the second half, closer to a diagonal"></svg>
  <p class="sx-note" aria-live="polite">&nbsp;</p>
</figure>

<ul>
<li>What matters is how spiky the group is: \(\max_j |w_j| \,/\, \ell\), its largest weight compared with the group's overall size, which is its length \(\ell\).</li>
<li>You can't remove a spike without changing the weights.</li>
<li>But you can change the axes you write them against.</li>
</ul>

<p>To visualize axes, let's consider the smallest case: groups of just 2 weights. Below is a row of weights cut into groups of two, like the one in the previous figure and at the same cell size. The groups run from a short one, where one weight is much bigger than the other, to a long one, where the two weights are equal:</p>

<figure class="widget wide" data-widget="rot2d" data-scene="main" data-layers="strips">
  <figcaption><strong>Groups of two weights.</strong> Each group has a number and a color, so that you can follow it through the figures below.</figcaption>
  <div class="sx-rowlabel sx-block">Groups</div>
  <div class="sx-controls">
    <label>Number of groups <input type="range" min="2" max="8" step="2" value="4" data-k="n"> <output data-o="n"></output></label>
      </div>
  <p class="sx-hint">The first group is short, and one of its two weights is much bigger than the other. The last is long, and its two weights are equal. The groups in between change gradually from one to the other, and the number of groups goes up in twos. In the first half one weight dominates: those groups are spiky (triangles). In the second half the weights are alike: those groups are flat (circles).</p>
  <div class="sx-trip">
    <div class="sx-tcol"><svg class="sx-gr" data-v="tw" role="img" aria-label="The weights of the groups as a row of cells, with each group's scale printed on it"></svg><p class="sx-hint">Weights, with each group's scale printed on it</p></div>
    <div class="sx-tcol"><svg class="sx-gr" data-v="ts" role="img" aria-label="Heatmap of the scale of each group"></svg><p class="sx-hint">Scale of each group, its largest weight (the more gold, the larger)</p></div>
    <div class="sx-tcol"><svg class="sx-gr" data-v="te" role="img" aria-label="Heatmap of the rounding error of each weight"></svg><p class="sx-hint">Rounding error, after rounding each weight to one of 4 levels (the redder, the larger)</p></div>
  </div>
</figure>

<p>Each group is just two numbers, <em>w</em><sub>1</sub> and <em>w</em><sub>2</sub>, so it can also be read as a point on a plane: the first weight is its horizontal coordinate and the second weight is its vertical one. Here are the same groups drawn that way, with the same numbers and colors:</p>

<figure class="widget wide" data-widget="rot2d" data-scene="main" data-layers="points">
  <figcaption><strong>Groups as points.</strong> Each marker is one group, placed at (<em>w</em><sub>1</sub>, <em>w</em><sub>2</sub>): triangles are the first half (closer to an axis), circles the second half (closer to a diagonal). Change the number of groups above and the markers move.</figcaption>
  <svg class="sx-r2" viewBox="0 0 330 300" style="max-width:34rem" role="img" aria-label="Each group of two weights drawn as a point, with the first weight on the horizontal axis and the second on the vertical axis"></svg>
</figure>

<p>Now let's see what quantization does to these points:</p>
<ul>
<li>The 2-bit levels, four per axis, form a grid of 16 points inside a square. A group is stored as the nearest grid point: each of its two weights is rounded to the nearest level, and the two level numbers (2 bits each) are what is saved.</li>
<li>A trail of fading shadows shows how far that rounding moves a group, from its real weights (the faintest shadow) to the grid point it is stored as (the solid marker). The length of the trail is the group's rounding error.</li>
<li>A point close to an axis has one big weight and one tiny one, so its square must be as large as the point is long, and the grid is coarse.</li>
<li>A point on the diagonal has two equal weights, which is as flat as it gets: the square is smaller and the grid finer.</li>
</ul>

<figure class="widget wide" data-widget="rot2d" data-scene="main" data-layers="points quant bits loss trail" data-toggles="squares:Squares;grid:Grid points;start:Real weights (start);trail:Trails;end:Stored positions (end);bits:Binary labels">
  <figcaption><strong>Quantizing groups of two weights.</strong> Each group has its own scale, as in step 1, so each gets its own square in its own color, drawn to just reach its largest weight. Each of the 16 grid points is a possible stored value. Each solid marker sits where its group is stored, with a trail of shadows behind it back to the group's real weights, and the label next to it gives that stored value, the two level numbers in binary (2 bits per weight). The selected group's levels are numbered along its square. Click a marker to select a group and make its square and outline thicker.</figcaption>
  <div class="sx-controls"><button data-act="replay">replay the movement</button></div>
  <svg class="sx-r2" viewBox="0 -8 330 322" style="max-width:34rem" role="img" aria-label="Groups as points with the square of quantization levels and the grid, each drawn where it is stored, with a trail of fading shadows back to its real weights"></svg>
  <p class="sx-cap2">Here is how much each group loses to rounding, the length of its trail as a share of the group's length, split into the first half (closer to an axis) and the second half (closer to a diagonal):</p>
  <svg class="sx-ol" data-v="loss" viewBox="0 0 640 200" role="img" aria-label="Rounding error of each group, split into the first half of the groups, closer to an axis, and the second half, closer to a diagonal"></svg>
  <p class="sx-note" data-v="lossnote" aria-live="polite">&nbsp;</p>
</figure>

<p>Now rotate the groups. The two curves show, at every angle, the largest weight as a share of the group's length, averaged over the first half of the groups, which are spiky (gold), and over the second half, which are flat (blue). Lower is flatter, and the rounding error follows it. The camera switch changes the viewpoint: off, the camera stays with the axes and the points move; on, it stays with the points, and the axes and squares turn the other way.</p>

<figure class="widget wide" data-widget="rot2d" data-scene="main" data-layers="points quant ghost curve loss" data-toggles="squares:Squares;grid:Grid points;pre:Pre-rotation locations;start:Rotated locations (start);end:Stored locations (end);trail:Arrows">
  <figcaption><strong>Rotating groups of two weights.</strong> Dashed outlines mark where the groups started, filled markers are where the rotation has taken them, and solid outlines are where each group is stored.</figcaption>
  <div class="sx-rowlabel sx-block">Rotation</div>
  <div class="sx-controls">
    <label>Angle <input type="range" min="0" max="90" step="1" value="0" data-k="deg"> <output data-o="deg"></output></label>
    <button data-act="reset">reset</button>
    <button data-act="follow" aria-pressed="false">camera follows the points</button>
  </div>
  <svg class="sx-r2" viewBox="0 0 640 300" role="img" aria-label="Groups as points with their squares of levels, and a curve of average spikiness against rotation angle"></svg>
  <p class="sx-note sx-readout" aria-live="polite">&nbsp;</p>
  <p class="sx-cap2">And here is how much each group loses to rounding at the current angle, split into the first half (spiky) and the second half (flat). Turn the angle and watch the two rows move:</p>
  <svg class="sx-ol" data-v="loss" viewBox="0 0 640 200" role="img" aria-label="Rounding error of each group at the current angle, split into the first half of the groups, closer to an axis, and the second half, closer to a diagonal"></svg>
  <p class="sx-note" data-v="lossnote" aria-live="polite">&nbsp;</p>
  <p class="sx-note">The rotation slider is only an animation: in practice a rotation is applied once, all at once.</p>
</figure>

<p>So a rotation helps spiky groups and hurts flat ones. That raises a natural question: how do we tell which kind a group is?</p>
<ul>
<li><strong>There is no sharp line between spiky and flat.</strong> In our figure the groups change gradually from sitting on an axis to sitting on a diagonal, and real groups do the same: how spiky a group is runs on a scale.</li>
<li><strong>A spiky group usually has one weight much larger than the rest.</strong> That weight is called an outlier, and it is what to look for in a real layer.</li>
<li><strong>In practice we use a heuristic.</strong> Compare the group's largest weight with its overall size, and call the group spiky if that ratio is far bigger than ordinary weights would give.</li>
<li><strong>Whistle does not try to tell.</strong> The converter applies the same rotation to every group. Whether that is a good bet depends on how many groups are spiky and on how many weights each group has, which is where we are heading.</li>
</ul>

<details class="detour">
<summary>Detour: measuring how spiky a group is</summary>

<p>Two numbers are commonly used. For a group of \(n\) weights \(w_1, \dots, w_n\) with length \(\lVert w\rVert\):</p>
<ul>
<li><strong>Spikiness</strong> \(s = \dfrac{\max_j |w_j|}{\lVert w\rVert}\): the largest weight as a share of the group's length. It is the quantity on the curves above. It runs from \(1/\sqrt{n}\) (all weights the same size) to 1 (a single weight).</li>
<li><strong>Crest factor</strong> \(c = \dfrac{\max_j |w_j|}{\mathrm{rms}(w)} = s\sqrt{n}\), where \(\mathrm{rms}(w) = \lVert w\rVert/\sqrt{n}\) is the typical size of a weight. It says how many typical weights the biggest one is worth, so it is easier to compare across group sizes.</li>
</ul>
<p>To decide what counts as large, compare with groups of ordinary weights, which behave like Gaussian numbers. Here is what 20,000 random Gaussian groups give:</p>
<div class="wide"><table>
<thead><tr><th>Group size \(n\)</th><th class="num">Flat \(s = 1/\sqrt{n}\)</th><th class="num">Typical \(s\): mean</th><th class="num">99th percentile</th><th class="num">Typical \(c\): mean</th><th class="num">99th percentile</th></tr></thead>
<tbody>
<tr><td>2</td><td class="num">0.71</td><td class="num">0.90</td><td class="num">1.00</td><td class="num">1.27</td><td class="num">1.41</td></tr>
<tr><td>8</td><td class="num">0.35</td><td class="num">0.65</td><td class="num">0.89</td><td class="num">1.84</td><td class="num">2.52</td></tr>
<tr><td>64</td><td class="num">0.125</td><td class="num">0.33</td><td class="num">0.45</td><td class="num">2.61</td><td class="num">3.60</td></tr>
<tr><td>128</td><td class="num">0.088</td><td class="num">0.25</td><td class="num">0.34</td><td class="num">2.84</td><td class="num">3.89</td></tr>
</tbody>
</table></div>
<p>A reasonable rule of thumb is to say a group of 64 has an outlier if its crest factor is above about 4: a weight more than four times the typical size, rarer than 1 group in 100 among ordinary ones. The threshold is a choice. The useful readout is the share of groups above it, measured layer by layer.</p>
<ul>
<li>In two dimensions the crest factor can never exceed \(\sqrt{2}\), so a rule like this has no bite. Our groups are spiky or flat only because of where we placed them.</li>
<li>With more weights the gap between a flat group and a spike grows, which is why outliers only become a sharp problem for bigger groups.</li>
</ul>
</details>

<p>Before we pick a rotation, here is why rotating the groups is safe at all:</p>
<ul>
<li><strong>Nothing is lost.</strong> A rotation keeps every point's length and can be undone exactly by rotating back, so the rounding error is the same size whichever side you measure it on.</li>
<li><strong>It costs no bits.</strong> There is nothing extra to store.</li>
</ul>
<details class="detour">
<summary>Detour: how is this different from PCA?</summary>

<p>If you have met <a href="https://en.wikipedia.org/wiki/Principal_component_analysis">principal component analysis</a> (PCA), this may look familiar, because PCA is also a rotation. But what we are trying to do is exactly the opposite of PCA. PCA looks for the angle that makes data points more spiky, so that most of the information sits in a few coordinates. We look for the angle that flattens them instead:</p>
<div class="wide"><table>
<thead><tr><th></th><th>PCA</th><th>What we want</th></tr></thead>
<tbody>
<tr><td>Goal</td><td>Make groups spikier: line the axes up with the directions the data varies along most, so the energy piles into a few coordinates</td><td>Make groups flatter: turn spikes away from the axes, so the energy spreads over all coordinates</td></tr>
<tr><td>Good for</td><td>Compressing, by dropping the small coordinates</td><td>Rounding, where one dominant coordinate stretches the levels for all the others</td></tr>
<tr><td>In short</td><td>The best angle to concentrate the data</td><td>The best angle to flatten it</td></tr>
</tbody>
</table></div>
<p>Here are both, applied to the same 24 groups of 8 weights. PCA piles the energy into a few coordinates, and a flattening rotation spreads it out:</p>

<figure class="widget wide" data-widget="pca">
  <figcaption><strong>PCA and a flattening rotation on the same groups.</strong> Each row of a grid is one group of 8 weights (blue negative, red positive). The bars show how the total energy, the sum of squares, is divided among the 8 coordinates. Pick a data set, and compare how each rotation changes the largest coordinate and the rounding error of a group.</figcaption>
  <div class="sx-controls">
    <span class="sx-seg"><button data-ds="spiky" aria-pressed="true">each group has one big weight</button><button data-ds="corr" aria-pressed="false">weights move together</button></span>
    <button data-act="new">new data</button>
  </div>
  <svg class="sx-pc" viewBox="0 0 900 285" role="img" aria-label="Three grids of 24 groups of 8 weights: as given, after PCA, and after a flattening rotation, with the energy per coordinate below each"></svg>
  <p class="sx-note" aria-live="polite">&nbsp;</p>
</figure>

<p>Here is the same contrast in three dimensions, where you can watch it happen:</p>
<ul>
<li>Each dot is a group of three weights, red when its 2-bit rounding error is large and blue when it is small.</li>
<li>The flattening rotation is a 60° turn about the diagonal direction (1, 1, 1), the flattest rotation of three weights (the detour on three weights at the end of this step shows it).</li>
<li>Choose a data set and a rotation, then drag the slider from 0 to 100% of that rotation. "Spin the view" turns the camera so you can see the cloud from all sides.</li>
</ul>

<figure class="widget wide" data-widget="pca3d">
  <figcaption><strong>PCA and a flattening rotation, in 3D.</strong> Gold dashed lines are the cloud's principal axes, the directions PCA turns into the coordinate axes. The readout gives the average rounding error and how the energy is divided among the three coordinates. Drag the background to look around.</figcaption>
  <div class="sx-controls">
    <span class="sx-seg"><button data-ds="axes" aria-pressed="true">spikes along the axes</button><button data-ds="corr" aria-pressed="false">weights move together</button></span>
    <span class="sx-seg"><button data-rot="pca" aria-pressed="true">PCA rotation</button><button data-rot="diag" aria-pressed="false">flattening rotation</button></span>
    <label>Rotate <input type="range" min="0" max="100" step="1" value="0" data-k="t"> <output data-o="t"></output></label>
    <button data-act="new">new data</button>
    <button data-act="spin" aria-pressed="false">spin the view</button>
  </div>
  <svg class="sx-r3" viewBox="0 0 640 330" role="img" aria-label="A cloud of points in three dimensions that rotates by PCA or by a flattening rotation, coloured by rounding error"></svg>
  <p class="sx-note sx-readout" aria-live="polite">&nbsp;</p>
  <p class="sx-note">The slider is only an animation. A real PCA step applies one matrix, fitted to the data, all at once. The flattening rotation is the 60° turn about (1, 1, 1).</p>
</figure>

<p>PCA and a flattening rotation do opposite jobs. When the data has no preferred direction (the first data set), PCA's axes are close to arbitrary, so it can help or hurt by chance. When the weights move together (the second), PCA does exactly what compression wants and exactly what rounding does not: it makes every group spikier.</p>

</details>

<p><strong>Which rotation?</strong> Many rotations would flatten a spike, as the figures above show. Whistle uses one that needs no multiplications and no stored matrix, the <a href="https://en.wikipedia.org/wiki/Hadamard_matrix">Walsh–Hadamard matrix</a>. Our groups so far have had two weights, but Whistle's have 64 or 128, so we need such a matrix for bigger groups too. It is a square matrix whose entries are all +1 or −1 (divided by \(\sqrt{n}\) so it keeps lengths). The 2×2 one is
\[ H_2 = \frac{1}{\sqrt{2}}\begin{bmatrix} 1 & 1 \\ 1 & -1 \end{bmatrix} \]
Each bigger one is four copies of the previous one, with the bottom-right copy negated. That gives a matrix for every size that doubles from 2: 4, 8, 16, and so on up to 64 and 128:
\[ H_{2n} = \frac{1}{\sqrt{2}}\begin{bmatrix} H_n & H_n \\ H_n & -H_n \end{bmatrix} \]
Here are the entries of these matrices, before the scaling:</p>

<figure class="widget wide" data-widget="hadamard">
  <figcaption><strong>Building a Walsh–Hadamard matrix by doubling.</strong> Blue is +1, red is −1. Pick a size, then click a row to see what it computes.</figcaption>
  <div class="sx-controls"><span class="sx-seg"><button data-n="2" aria-pressed="false">2×2</button><button data-n="4" aria-pressed="false">4×4</button><button data-n="8" aria-pressed="false">8×8</button><button data-n="16" aria-pressed="true">16×16</button></span></div>
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

<p><strong>Why and when the Hadamard matrix flattens best.</strong> The figures above showed that rotating a spiky group can help. Here is what makes the Hadamard rotation the one to use, and when it works.</p>

<p>Why: a lone spike of any size ends up, after a Hadamard rotation, equally spread over all \(n\) outputs, so each output holds \(1/\sqrt{n}\) of its length. The more weights share the rotation, the flatter it gets:</p>
\[ \frac{\text{largest coordinate}}{\text{length}} \;=\; \frac{1}{\sqrt{n}} \]
<div class="wide"><table>
<thead><tr><th>Weights in the group</th><th class="num">Largest coordinate after rotating a lone spike</th></tr></thead>
<tbody>
<tr><td>1 (nothing to spread over)</td><td class="num">100% of the length</td></tr>
<tr><td>3 (no Hadamard matrix exists for this size; see the detour on three weights)</td><td class="num">at best 58%</td></tr>
<tr><td>8</td><td class="num">35%</td></tr>
<tr><td>64</td><td class="num">12.5% (1/8)</td></tr>
<tr><td>128</td><td class="num">8.8%</td></tr>
</tbody>
</table></div>
<p>In two dimensions the Hadamard matrix is exactly the 45° rotation with its two outputs swapped, so the 2D picture shows when it helps. This is the same figure as before, with that angle marked:</p>

<figure class="widget wide" data-widget="rot2d" data-scene="had" data-groups="clusters" data-layers="points quant ghost curve" data-had="1">
  <figcaption><strong>The Hadamard angle.</strong> Two kinds of group, as before, but now arranged symmetrically: the spiky groups (triangles) are spread evenly on both sides of an axis, and the flat groups (circles) on both sides of a diagonal. That way the Hadamard matrix, marked on the curves and shown next to the rotation matrix, sits exactly at the bottom of the spiky curve. Rotate:</figcaption>
  <div class="sx-rowlabel sx-block">Groups</div>
  <div class="sx-controls">
    <label>Number of groups <input type="range" min="2" max="8" step="2" value="4" data-k="n"> <output data-o="n"></output></label>
      </div>
  <div class="sx-rowlabel sx-block">Rotation</div>
  <div class="sx-controls">
    <label>Angle <input type="range" min="0" max="90" step="1" value="0" data-k="deg"> <output data-o="deg"></output></label>
    <button data-act="had">45° (Hadamard)</button>
    <button data-act="reset">reset</button>
    <button data-act="follow" aria-pressed="false">camera follows the points</button>
  </div>
  <svg class="sx-r2" viewBox="0 0 640 300" role="img" aria-label="Points on a circle with the square of quantization levels around each group, and a curve of average spikiness against rotation angle with the Hadamard angle marked"></svg>
  <p class="sx-note sx-readout" aria-live="polite">&nbsp;</p>
  <div class="sx-mat"></div>
  <p class="sx-note">In two dimensions the match is exact: the Hadamard matrix is the 45° rotation with its two outputs swapped. Swapping outputs does not change the rounding error, because the grid is the same either way.</p>
  <div class="callout">
    <strong>When does 45° (the Hadamard matrix) give the least spikiness?</strong> Only for certain groups, and the two curves show which:
    <ul>
    <li><strong>Spiky groups, the triangles.</strong> They start near an axis, as far from 45° as possible, so turning by 45° brings them to the flat direction. The gold curve is lowest at 45°.</li>
    <li><strong>Flat groups, the circles.</strong> They start near a diagonal, so they are already flat, and 45° turns them into spikes. The blue curve peaks at 45°.</li>
    </ul>
    With 64 weights the same holds. A single big weight is a spike along one axis, and the Hadamard matrix spreads it evenly over all 64 outputs. The groups it makes spikier are the ones that already look like one of its rows: a group whose 64 weights are all equal becomes a single spike. Weights with one large outlier are far more common than that, which is why Whistle uses it.
  </div>

</figure>

<p>For other group sizes the flattest a rotation can be is set by the length: each row of the matrix has length 1, so its largest entry is at least \(1/\sqrt{n}\). The Hadamard matrix reaches that bound whenever it exists:</p>
<div class="wide"><table>
<thead><tr><th>Group size \(n\)</th><th class="num">Smallest largest entry</th><th>Which matrix gets there</th></tr></thead>
<tbody>
<tr><td>2</td><td class="num">0.71</td><td>The Hadamard matrix, exactly: the 45° rotation above</td></tr>
<tr><td>3</td><td class="num">0.67</td><td>No Hadamard matrix of this size exists. The 60° rotation in the detour on three weights is the flattest we found (a numerical search agrees)</td></tr>
<tr><td>4</td><td class="num">0.5</td><td>The 4×4 Hadamard matrix</td></tr>
<tr><td>8</td><td class="num">0.35</td><td>The 8×8 Hadamard matrix</td></tr>
<tr><td>64</td><td class="num">0.125</td><td>The 64×64 Hadamard matrix, which is why groups of 64 (or 128) are a natural size</td></tr>
</tbody>
</table></div>

<details class="detour">
<summary>Detour: what about the 3D case (3 weights per group)?</summary>

<p>Everything so far used groups of two weights, and Whistle's groups have 64 or 128. Three weights is the case in between that you can still draw. It comes with a catch: <strong>a Hadamard matrix can't be built for three weights.</strong> The doubling rule only makes sizes 2, 4, 8, 16 and so on, and in general a matrix of +1 and −1 entries with perpendicular rows exists only for sizes 1, 2 and multiples of 4. So for three weights we use the flattest rotation we know instead: a turn about the diagonal direction \((1, 1, 1)\), which is best at 60°.</p>

<p>Here are some groups of three weights, laid out like the two-weight ones. They run from a short group where one weight dominates to a long group where all three weights are equal:</p>

<figure class="widget wide" data-widget="rot3dg" data-scene="three" data-layers="strips">
  <figcaption><strong>Groups of three weights.</strong> Each group has a number and a color. The first half, where one weight dominates, are spiky (triangles). The second half, where the weights are alike, are flat (circles).</figcaption>
  <div class="sx-rowlabel sx-block">Groups</div>
  <div class="sx-controls">
    <label>Number of groups <input type="range" min="2" max="8" step="2" value="4" data-k="n"> <output data-o="n"></output></label>
  </div>
  <div class="sx-trip">
    <div class="sx-tcol"><svg class="sx-gr" data-v="tw" role="img" aria-label="The weights of the groups as a row of cells, with each group's scale printed on it"></svg><p class="sx-hint">Weights, with each group's scale printed on it</p></div>
    <div class="sx-tcol"><svg class="sx-gr" data-v="ts" role="img" aria-label="Heatmap of the scale of each group"></svg><p class="sx-hint">Scale of each group, its largest weight (the more gold, the larger)</p></div>
    <div class="sx-tcol"><svg class="sx-gr" data-v="te" role="img" aria-label="Heatmap of the rounding error of each weight"></svg><p class="sx-hint">Rounding error, after rounding each weight to one of 4 levels (the redder, the larger)</p></div>
  </div>
</figure>

<p>Three weights make a point in 3D space, one weight per axis. Each group gets a cube of levels, 4 per axis, that just reaches its largest weight. Here is the same setup as for two weights, with the groups rotated about the diagonal:</p>

<figure class="widget wide" data-widget="rot3dg" data-scene="three" data-layers="points quant ghost curve loss" data-toggles="cubes:Cubes;grid:Grid points;pre:Pre-rotation locations;start:Rotated locations (start);end:Stored locations (end);trail:Arrows">
  <figcaption><strong>Rotating groups of three weights.</strong> Dashed outlines mark where the groups started, filled markers are where the rotation has taken them, and solid outlines are where each group is stored. Drag the background to look around, click a marker to select a group, or switch on "spin the view" and move the slider while everything turns.</figcaption>
  <div class="sx-rowlabel sx-block">Rotation</div>
  <div class="sx-controls">
    <label>Angle <input type="range" min="0" max="120" step="1" value="0" data-k="deg"> <output data-o="deg"></output></label>
    <button data-act="flat">60° (flattest)</button>
    <button data-act="reset">reset</button>
    <button data-act="follow" aria-pressed="false">camera follows the points</button>
    <button data-act="spin" aria-pressed="false">spin the view</button>
  </div>
  <svg class="sx-r3 sx-r3g" viewBox="0 0 640 330" role="img" aria-label="Groups of three weights as points in three dimensions with a cube of quantization levels around each, rotated about the diagonal, and a curve of average spikiness against rotation angle"></svg>
  <p class="sx-note sx-readout" aria-live="polite">&nbsp;</p>
  <div class="sx-mat"></div>
  <p class="sx-cap2">And here is how much each group loses to rounding at the current angle, split into the first half (spiky) and the second half (flat):</p>
  <svg class="sx-ol" data-v="loss" viewBox="0 0 640 200" role="img" aria-label="Rounding error of each group at the current angle, split into the first half and the second half"></svg>
  <p class="sx-note" data-v="lossnote" aria-live="polite">&nbsp;</p>
  <p class="sx-note">The slider is only an animation: in practice a rotation is applied once, all at once.</p>
</figure>

<p>Two things differ from the two-weight picture:</p>
<ul>
<li>The flat groups sit on the diagonal that the rotation turns about, so they hardly move, and the rotation does not hurt them here the way it did in 2D.</li>
<li>At 60° the rotation matrix has entries of ±2/3 and ±1/3, which is as flat as any 3×3 rotation can be. That flattens a lone spike to two thirds of its length, a smaller gain than for bigger groups, where a Hadamard matrix takes it down to \(1/\sqrt{n}\).</li>
</ul>
</details>

<p id="step-3" data-toc="Step 3: snap to a codebook"><strong>Step 3: snap to a codebook made for bell curves.</strong></p>
<ul>
<li>Rotated groups all have roughly the same bell shape (once divided by their length), so one set of levels can serve all of them.</li>
<li>The levels come from <a href="https://en.wikipedia.org/wiki/Lloyd%27s_algorithm">Lloyd's algorithm</a> run on a Gaussian: dense near zero, where most values are, and sparse in the tails. That set is the codebook.</li>
<li>Each weight stores the 4-bit index of its nearest level.</li>
<li>With 2 bits there are only 4 levels. Whistle mixes 2- and 4-bit layers.</li>
</ul>

<p>Here is that idea on the two-weight groups from step 2. The length of each group is divided out, so the dots sit on a circle of length 1, and one grid is shared by every group:</p>

<figure class="widget wide" data-widget="rot2d" data-scene="step3" data-layers="strips points quant ghost curve" data-levels="fixed">
  <figcaption><strong>One fixed grid for every group.</strong> A group's scale is now its length, and its weights are what is left after dividing it out. The gold square is the one grid all groups share. It is sized here for a perfectly flat group, with both weights 0.71, while Whistle's grid is Gaussian-shaped and built for groups of 64. Rotate the groups and watch the arrows: they shrink for the triangles (the spiky first half) as those get flatter, and grow for the circles (the flat second half):</figcaption>
  <div class="sx-rowlabel sx-block">Groups</div>
  <div class="sx-controls">
    <label>Number of groups <input type="range" min="2" max="8" step="2" value="4" data-k="n"> <output data-o="n"></output></label>
      </div>
  <div class="sx-trip">
    <div class="sx-tcol"><svg class="sx-gr" data-v="tw" role="img" aria-label="The weights of the groups with the length divided out, with each group's length printed on it"></svg><p class="sx-hint">Weights with the length divided out, and each group's length (its scale) printed on it</p></div>
    <div class="sx-tcol"><svg class="sx-gr" data-v="ts" role="img" aria-label="Heatmap of the length of each group"></svg><p class="sx-hint">Scale of each group, its length (the more gold, the larger)</p></div>
    <div class="sx-tcol"><svg class="sx-gr" data-v="te" role="img" aria-label="Heatmap of the rounding error of each weight"></svg><p class="sx-hint">Rounding error, in units of the group's length (the redder, the larger)</p></div>
  </div>
  <div class="sx-rowlabel sx-block">Rotation</div>
  <div class="sx-controls">
    <label>Angle <input type="range" min="0" max="90" step="1" value="0" data-k="deg"> <output data-o="deg"></output></label>
    <button data-act="reset">reset</button>
    <button data-act="follow" aria-pressed="false">camera follows the points</button>
  </div>
  <svg class="sx-r2" viewBox="0 0 640 300" role="img" aria-label="Groups on a circle of length 1 with one shared grid of quantization levels, arrows to the grid points, and a curve of average spikiness against rotation angle"></svg>
  <p class="sx-note sx-readout" aria-live="polite">&nbsp;</p>
</figure>

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

<p>What it costs to store:</p>
<ul>
<li>A group of 64 weights takes \(64\times 4\) bits plus one 32-bit length, which is \(\dfrac{64\times 4 + 32}{64} = 4.5\) bits per weight on average, because the one length is shared by all 64.</li>
<li>SmolLM2 went from 538 MB to 76 MB.</li>
<li>Whistle is 16.9 MB.</li>
</ul>

<p id="step-4" data-toc="Step 4: never rebuild the weights"><strong>Step 4: never rebuild the weights.</strong></p>
<ul>
<li>To use a weight you'd normally decode it: look up its level, multiply by the length, rotate back.</li>
<li>Doing that for 135 million weights per word would be slow.</li>
<li>Instead the kernel uses the fact that rotating both sides of a <a href="https://en.wikipedia.org/wiki/Dot_product">dot product</a> doesn't change it.</li>
</ul>
<p>What a layer computes is the weights' dot product with the incoming numbers (the activations), and since the rotation is its own inverse:</p>
\[ \mathbf{w}\cdot\mathbf{x} \;=\; (H\mathbf{w})\cdot(H\mathbf{x}) \;=\; \ell\sum_k c_{\mathrm{idx}_k}\,(H\mathbf{x})_k \]
<p>Here \(\mathbf{w}\) is a group of weights, \(\mathbf{x}\) the matching activations, \(\ell\) the group's length, \(c\) the codebook, and \(\mathrm{idx}_k\) the index stored for weight \(k\).</p>
<p>So in practice:</p>
<ul>
<li>The kernel rotates the <em>activations</em> once per group and reuses them for every row of the matrix: thousands of rows share one rotation.</li>
<li>The weights stay as indices.</li>
<li>On the iPod's <a href="https://en.wikipedia.org/wiki/ARM_architecture_family#Advanced_SIMD_(Neon)">NEON</a> unit, one table-lookup instruction (<code>vtbl</code>) turns 8 indices into 8 small integer levels.</li>
<li>Multiply-accumulate instructions then sum 8 or 16 products at a time.</li>
</ul>

<p>The rotation itself is cheap thanks to the <a href="https://en.wikipedia.org/wiki/Fast_Walsh%E2%80%93Hadamard_transform">fast Walsh–Hadamard transform</a>. Because the matrix is built by doubling, it can be applied in \(\log_2 n\) rounds of add-and-subtract on pairs, the same <a href="https://en.wikipedia.org/wiki/Butterfly_diagram">butterfly</a> pattern as the FFT, with no multiplications:</p>

<figure class="widget wide" data-widget="fwht">
  <figcaption><strong>The fast transform on 8 numbers.</strong> Each round replaces pairs (a, b) with (a + b, a − b). Step through the rounds.</figcaption>
  <div class="sx-controls"><button data-act="next">next round ▶</button><button data-act="reset">reset</button></div>
  <div class="sx-fwht"></div>
  <p class="sx-note" aria-live="polite">&nbsp;</p>
</figure>

<p>One more refinement is for SmolLM2 only:</p>
<ul>
<li>Rounding each weight to its nearest level is the simplest choice, but not the best one: the errors of neighbouring weights can add up or cancel out.</li>
<li><a href="https://arxiv.org/abs/2210.17323">GPTQ</a> rounds the weights one at a time and nudges the not-yet-rounded ones to compensate, using statistics of real activations (here, from 40 chat questions).</li>
<li>It ran on the Mac in a minute, in the rotated domain, with one GPTQ block per group.</li>
</ul>
<p><a href="https://en.wikipedia.org/wiki/Perplexity">Perplexity</a> on held-out chats, where lower is better:</p>

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

<p>About the models and the daemon:</p>
<ul>
<li>The earlier pair, <a href="https://huggingface.co/UsefulSensors/moonshine-tiny">Moonshine Tiny</a> (<a href="https://arxiv.org/abs/2410.15608">paper</a>, 30 MB) and the evenly spaced 4/8-bit SmolLM2 (98 MB), is still supported as a fallback.</li>
<li>Whistle matched Moonshine's speed on the iPod with half the memory.</li>
<li>On six questions asked by a real voice, Whistle got two right and Moonshine none.</li>
</ul>

<p>The daemon also does a few things to save time:</p>
<ul>
<li>It trims silence before speech recognition. Siri often keeps recording for seconds after you stop, and recognition time grows with audio length.</li>
<li>It skips Siri's end tone.</li>
<li>It caches the system prompt.</li>
<li>It stops after two sentences, as Siri would.</li>
</ul>
</section>

<section>
