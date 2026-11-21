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

<p>To get a feel for what grouping buys, try it on a toy matrix of 12 rows and 64 columns:</p>
<ul>
<li>Slide "Groups per row" up from one, which is a single scale for the whole row, and watch the rounding error fall.</li>
<li>"Groups with outliers" and "Outlier size" decide how many groups contain an outlier and how big it is. Slide the first down to 0 to see how much of the effect the added outliers cause.</li>
<li>The 16 levels are spread evenly up to the largest weight in each group: the plain scheme from the figure above.</li>
</ul>

<figure class="widget wide" id="why-grouped" data-widget="grouping">
  <figcaption><strong>Why weights are grouped.</strong> Each cell is one weight (blue negative, red positive). White lines separate the rows and the groups within each row, and every row has its own groups and scales. The number printed on each group is its scale, its largest weight (Whistle uses the group's length instead, as we will see). A gold outline marks an outlier, and a group that contains one is outlined in the scales heatmap.</figcaption>
  <div class="sx-controls">
    <label>Groups per row <input type="range" min="0" max="4" step="1" value="3" data-k="g"> <output data-o="g"></output></label>
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
<h4 id="s2-spike" data-toc="A spike costs the whole group">A spike costs the whole group</h4>

<p>Here are the groups from the figure above, split into those that contain an outlier and the rest. Each dot is one group, and the tick marks the average:</p>

<figure class="widget wide" data-widget="outlierloss">
  <figcaption><strong>Groups with an outlier lose more.</strong> It follows the matrix and the groups per row you chose above, and "New matrix", "Groups with outliers" and "Outlier size" change it too.</figcaption>
  <svg class="sx-ol" viewBox="0 0 640 200" role="img" aria-label="Average rounding error of each group, split into the first half of the groups, closer to an axis, and the second half, closer to a diagonal"></svg>
  <p class="sx-note" aria-live="polite">&nbsp;</p>
</figure>

<ul>
<li>What matters is how spiky a group is: \(\max_j |w_j| \,/\, \ell\), its largest weight compared with the group's length \(\ell\).</li>
<li>We can't remove a spike without changing the weights.</li>
<li>But we can change the axes we write the weights against. That is what a rotation does.</li>
</ul>

<h4 id="s2-points" data-toc="Groups as points">Groups of two weights, as points</h4>

<p>To visualize axes, let's consider the smallest case: groups of just 2 weights. Below is a row of weights cut into groups of two, like one row of the toy matrix above and at the same cell size. The groups run from a short one, where one weight is much bigger than the other, to a long one, where the two weights are equal:</p>

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

<h4 id="s2-quant" data-toc="Quantizing the points">Quantizing the points</h4>

<p>Now let's see what quantization does to these points:</p>
<ul>
<li>The 2-bit levels, four per axis, form a grid of 16 points inside a square. A group is stored as the nearest grid point: each of its two weights is rounded to the nearest level, and the two level numbers (2 bits each) are what is saved.</li>
<li>A trail of fading shadows shows how far that rounding moves a group, from its real weights (the faintest shadow) to the grid point it is stored as (the solid marker). The length of the trail is the group's rounding error.</li>
<li>A point close to an axis has one big weight and one tiny one, so its square must be as large as the point is long, and the grid is coarse.</li>
<li>A point on the diagonal has two equal weights, which is as flat as it gets: the square is smaller and the grid finer.</li>
</ul>

<figure class="widget wide" data-widget="rot2d" data-scene="main" data-layers="points quant bits loss trail" data-toggles="squares:Squares;grid:Grid points;start:Real weights (start);trail:Trails;end:Stored positions (end);bits:Binary labels">
  <figcaption><strong>Quantizing groups of two weights.</strong> Each group has its own scale, as in step 1, so each gets its own square in its own color, drawn to just reach its largest weight. Each grid point is a possible stored value, and the label next to each solid marker gives its group's stored value: the two level numbers in binary, 2 bits per weight. A trail of shadows leads back to the group's real weights. The selected group's levels are numbered along its square. Click a marker to select a group.</figcaption>
  <div class="sx-controls"><button data-act="replay">replay the movement</button></div>
  <svg class="sx-r2" viewBox="0 -8 330 322" style="max-width:34rem" role="img" aria-label="Groups as points with the square of quantization levels and the grid, each drawn where it is stored, with a trail of fading shadows back to its real weights"></svg>
  <p class="sx-cap2">Here is how much each group loses to rounding, the length of its trail as a share of the group's length, split into the first half (closer to an axis) and the second half (closer to a diagonal):</p>
  <svg class="sx-ol" data-v="loss" viewBox="0 0 640 200" role="img" aria-label="Rounding error of each group, split into the first half of the groups, closer to an axis, and the second half, closer to a diagonal"></svg>
  <p class="sx-note" data-v="lossnote" aria-live="polite">&nbsp;</p>
</figure>

<h4 id="s2-rotate" data-toc="Rotating the points">Rotating the points</h4>

<p>Now rotate the groups and watch what happens to each half:</p>
<ul>
<li>The two curves show, at every angle, the largest weight as a share of the group's length, averaged over the spiky first half (gold) and the flat second half (blue). Lower is flatter, and the rounding error follows it.</li>
<li>The loss diagram under the plot shows how much each group loses at the current angle.</li>
<li>The camera switch changes the viewpoint. Off, the camera stays with the axes and the points move. On, it stays with the points, and the axes and squares turn the other way.</li>
</ul>

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

<h4 id="s2-tell" data-toc="Spiky or flat?">Spiky or flat? Telling them apart</h4>

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

<h4 id="s2-which" data-toc="Which rotation?">Which rotation?</h4>

<p>Many rotations would flatten a spike, as the figures above show. Whistle uses one that needs no multiplications and no stored matrix, because a simple rule generates it: the <a href="https://en.wikipedia.org/wiki/Hadamard_matrix">Walsh–Hadamard matrix</a>. Our groups so far have had two weights, but Whistle's have 64 or 128, so we need one for bigger groups too.</p>
<p>It is a square matrix whose entries are all +1 or −1, divided by \(\sqrt{n}\) so that it keeps lengths. The 2×2 one is
\[ H_2 = \frac{1}{\sqrt{2}}\begin{bmatrix} 1 & 1 \\ 1 & -1 \end{bmatrix} \]
and each bigger one is four copies of the previous one, with the bottom-right copy negated:
\[ H_{2n} = \frac{1}{\sqrt{2}}\begin{bmatrix} H_n & H_n \\ H_n & -H_n \end{bmatrix} \]
That gives a matrix for every size that doubles from 2: 4, 8, 16, and so on up to 64 and 128. Here are the entries, before the scaling:</p>

<figure class="widget wide" data-widget="hadamard">
  <figcaption><strong>Building a Walsh–Hadamard matrix by doubling.</strong> Blue is +1, red is −1. Pick a size, then click a row to see what it computes.</figcaption>
  <div class="sx-controls"><span class="sx-seg"><button data-n="2" aria-pressed="false">2×2</button><button data-n="4" aria-pressed="false">4×4</button><button data-n="8" aria-pressed="false">8×8</button><button data-n="16" aria-pressed="true">16×16</button></span></div>
  <div class="sx-had"></div>
  <p class="sx-note" aria-live="polite">&nbsp;</p>
</figure>

<p>Two properties make this the right tool:</p>
<ul>
<li><strong>Every output mixes every input.</strong> Each output is a ± sum of all the group's weights, so one large weight spreads evenly over all 64 outputs instead of dominating one.
<ul>
<li>Sums of many ± terms tend toward a bell curve (the <a href="https://en.wikipedia.org/wiki/Central_limit_theorem">central limit theorem</a>), so the rotated group looks much more <a href="https://en.wikipedia.org/wiki/Normal_distribution">Gaussian</a> than the original, with no lone extremes.</li>
<li><a href="https://arxiv.org/abs/2402.04396">QuIP#</a> and <a href="https://arxiv.org/abs/2404.00456">QuaRot</a> use the same idea for large models.</li>
</ul></li>
<li><strong>It is its own inverse.</strong> The rows are <a href="https://en.wikipedia.org/wiki/Orthogonal_matrix">orthogonal</a> and the matrix is symmetric, so applying it twice gives back the original. Rotating loses nothing.</li>
</ul>

<p>To see the first property at work: orange is a group of weights as they come, with some outliers mixed in, and blue is the same group after rotation. The histograms below the bars show where the values sit:</p>

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

<h4 id="s2-hadamard" data-toc="Why Hadamard flattens best">Why and when the Hadamard matrix flattens best</h4>

<p>The figures above showed that rotating a spiky group can help. Here is what makes the Hadamard rotation the one to use, and when it works.</p>

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
<p>In two dimensions the Hadamard matrix is exactly the 45° rotation with its two outputs swapped, so the two-weight picture shows when it helps. Here it is again, with that angle marked:</p>

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

<h4 id="s2-matrix" data-toc="A whole matrix, rotated">A whole matrix, rotated</h4>

<p>Here is the toy matrix from step 1 again, with every group rotated by the same Hadamard matrix. The left half of each heatmap is the matrix as it was, and the right half is the same weights after rotation. Both halves use the plain scheme from step 1, with 16 evenly spaced levels up to the group's largest weight:</p>

<figure class="widget wide" id="rotated-grouping" data-widget="groupingrot">
  <figcaption><strong>The same matrix, before and after rotating each group.</strong> Each cell is one weight (blue negative, red positive), and white lines separate the groups. A gold outline marks an outlier on the left, and the group that contains it is outlined in the scales heatmap on both sides.</figcaption>
  <div class="sx-controls">
    <label>Groups per row <input type="range" min="0" max="4" step="1" value="3" data-k="g"> <output data-o="g"></output></label>
    <label>Groups with outliers <input type="range" min="0" max="12" step="1" value="6" data-k="nout"> <output data-o="nout"></output></label>
    <label>Outlier size <input type="range" min="2" max="16" step="1" value="8" data-k="osize"> <output data-o="osize"></output></label>
    <button data-act="new">New matrix</button>
  </div>
  <svg class="sx-gr" data-v="w" role="img" aria-label="Heatmaps of the toy weight matrix, unrotated on the left and rotated on the right"></svg>
  <p class="sx-gcap">Scale of each group, its largest weight (the more gold, the larger)</p>
  <svg class="sx-gr" data-v="s" role="img" aria-label="Heatmaps of the scale of each group, unrotated on the left and rotated on the right"></svg>
  <p class="sx-gcap">Rounding error after 4 bits, per weight (redder is larger)</p>
  <svg class="sx-gr" data-v="e" role="img" aria-label="Heatmaps of the rounding error of each weight, unrotated on the left and rotated on the right"></svg>
  <table class="sx-stat"></table>
</figure>

<ul>
<li><strong>Weights:</strong> an outlier's color is spread across its whole group on the right, as many mild cells instead of one strong one.</li>
<li><strong>Scales:</strong> the groups that held an outlier are no longer much more gold than their neighbors, because the largest weight in the group has shrunk.</li>
<li><strong>Errors:</strong> the rows of red cells in those groups fade. Rotation keeps lengths, so the error on the right is the same as the error after rotating back.</li>
<li>The groups without an outlier barely change, or lose a little, as the table shows.</li>
</ul>

<p>So the rotation is settled: one Hadamard matrix, applied to every group. Next come the levels.</p>

<p id="step-3" data-toc="Step 3: snap to a codebook"><strong>Step 3: snap to a codebook made for bell curves.</strong></p>

<p>Step 2 leaves every group rotated but still at its own length. Here are four such groups of two weights, as points. With the plain scheme from step 1, each needs a grid of levels sized to its own largest weight:</p>

<figure class="widget wide">
  <figcaption><strong>Rotated groups, each with its own grid.</strong> Four groups of two weights after rotation, and the 4 × 4 grid of levels that would be built around each one.</figcaption>
  <svg class="sx-sz" viewBox="0 0 640 340" role="img" aria-label="Four groups of two weights as points, each surrounded by its own square grid of 16 quantization levels, in four different sizes">
  <line x1="25.0" y1="170" x2="325.0" y2="170" style="stroke:var(--muted);stroke-width:1"/>
  <line x1="175" y1="320.0" x2="175" y2="20.0" style="stroke:var(--muted);stroke-width:1"/>
  <text x="331.0" y="174" class="lbl">w₁</text><text x="181" y="16.0" class="lbl">w₂</text>
  <rect x="48.9" y="43.9" width="252.3" height="252.3" style="fill:none;stroke:var(--pc3);stroke-width:1.6"/>
  <circle cx="48.9" cy="296.1" r="2.4" style="fill:var(--pc3)"/>
  <circle cx="48.9" cy="212.0" r="2.4" style="fill:var(--pc3)"/>
  <circle cx="48.9" cy="128.0" r="2.4" style="fill:var(--pc3)"/>
  <circle cx="48.9" cy="43.9" r="2.4" style="fill:var(--pc3)"/>
  <circle cx="133.0" cy="296.1" r="2.4" style="fill:var(--pc3)"/>
  <circle cx="133.0" cy="212.0" r="2.4" style="fill:var(--pc3)"/>
  <circle cx="133.0" cy="128.0" r="2.4" style="fill:var(--pc3)"/>
  <circle cx="133.0" cy="43.9" r="2.4" style="fill:var(--pc3)"/>
  <circle cx="217.0" cy="296.1" r="2.4" style="fill:var(--pc3)"/>
  <circle cx="217.0" cy="212.0" r="2.4" style="fill:var(--pc3)"/>
  <circle cx="217.0" cy="128.0" r="2.4" style="fill:var(--pc3)"/>
  <circle cx="217.0" cy="43.9" r="2.4" style="fill:var(--pc3)"/>
  <circle cx="301.1" cy="296.1" r="2.4" style="fill:var(--pc3)"/>
  <circle cx="301.1" cy="212.0" r="2.4" style="fill:var(--pc3)"/>
  <circle cx="301.1" cy="128.0" r="2.4" style="fill:var(--pc3)"/>
  <circle cx="301.1" cy="43.9" r="2.4" style="fill:var(--pc3)"/>
  <rect x="76.1" y="71.1" width="197.7" height="197.7" style="fill:none;stroke:var(--pc2);stroke-width:1.6"/>
  <circle cx="76.1" cy="268.9" r="2.4" style="fill:var(--pc2)"/>
  <circle cx="76.1" cy="203.0" r="2.4" style="fill:var(--pc2)"/>
  <circle cx="76.1" cy="137.0" r="2.4" style="fill:var(--pc2)"/>
  <circle cx="76.1" cy="71.1" r="2.4" style="fill:var(--pc2)"/>
  <circle cx="142.0" cy="268.9" r="2.4" style="fill:var(--pc2)"/>
  <circle cx="142.0" cy="203.0" r="2.4" style="fill:var(--pc2)"/>
  <circle cx="142.0" cy="137.0" r="2.4" style="fill:var(--pc2)"/>
  <circle cx="142.0" cy="71.1" r="2.4" style="fill:var(--pc2)"/>
  <circle cx="208.0" cy="268.9" r="2.4" style="fill:var(--pc2)"/>
  <circle cx="208.0" cy="203.0" r="2.4" style="fill:var(--pc2)"/>
  <circle cx="208.0" cy="137.0" r="2.4" style="fill:var(--pc2)"/>
  <circle cx="208.0" cy="71.1" r="2.4" style="fill:var(--pc2)"/>
  <circle cx="273.9" cy="268.9" r="2.4" style="fill:var(--pc2)"/>
  <circle cx="273.9" cy="203.0" r="2.4" style="fill:var(--pc2)"/>
  <circle cx="273.9" cy="137.0" r="2.4" style="fill:var(--pc2)"/>
  <circle cx="273.9" cy="71.1" r="2.4" style="fill:var(--pc2)"/>
  <rect x="110.2" y="105.2" width="129.5" height="129.5" style="fill:none;stroke:var(--pc1);stroke-width:1.6"/>
  <circle cx="110.2" cy="234.8" r="2.4" style="fill:var(--pc1)"/>
  <circle cx="110.2" cy="191.6" r="2.4" style="fill:var(--pc1)"/>
  <circle cx="110.2" cy="148.4" r="2.4" style="fill:var(--pc1)"/>
  <circle cx="110.2" cy="105.2" r="2.4" style="fill:var(--pc1)"/>
  <circle cx="153.4" cy="234.8" r="2.4" style="fill:var(--pc1)"/>
  <circle cx="153.4" cy="191.6" r="2.4" style="fill:var(--pc1)"/>
  <circle cx="153.4" cy="148.4" r="2.4" style="fill:var(--pc1)"/>
  <circle cx="153.4" cy="105.2" r="2.4" style="fill:var(--pc1)"/>
  <circle cx="196.6" cy="234.8" r="2.4" style="fill:var(--pc1)"/>
  <circle cx="196.6" cy="191.6" r="2.4" style="fill:var(--pc1)"/>
  <circle cx="196.6" cy="148.4" r="2.4" style="fill:var(--pc1)"/>
  <circle cx="196.6" cy="105.2" r="2.4" style="fill:var(--pc1)"/>
  <circle cx="239.8" cy="234.8" r="2.4" style="fill:var(--pc1)"/>
  <circle cx="239.8" cy="191.6" r="2.4" style="fill:var(--pc1)"/>
  <circle cx="239.8" cy="148.4" r="2.4" style="fill:var(--pc1)"/>
  <circle cx="239.8" cy="105.2" r="2.4" style="fill:var(--pc1)"/>
  <rect x="144.3" y="139.3" width="61.4" height="61.4" style="fill:none;stroke:var(--pc0);stroke-width:1.6"/>
  <circle cx="144.3" cy="200.7" r="2.4" style="fill:var(--pc0)"/>
  <circle cx="144.3" cy="180.2" r="2.4" style="fill:var(--pc0)"/>
  <circle cx="144.3" cy="159.8" r="2.4" style="fill:var(--pc0)"/>
  <circle cx="144.3" cy="139.3" r="2.4" style="fill:var(--pc0)"/>
  <circle cx="164.8" cy="200.7" r="2.4" style="fill:var(--pc0)"/>
  <circle cx="164.8" cy="180.2" r="2.4" style="fill:var(--pc0)"/>
  <circle cx="164.8" cy="159.8" r="2.4" style="fill:var(--pc0)"/>
  <circle cx="164.8" cy="139.3" r="2.4" style="fill:var(--pc0)"/>
  <circle cx="185.2" cy="200.7" r="2.4" style="fill:var(--pc0)"/>
  <circle cx="185.2" cy="180.2" r="2.4" style="fill:var(--pc0)"/>
  <circle cx="185.2" cy="159.8" r="2.4" style="fill:var(--pc0)"/>
  <circle cx="185.2" cy="139.3" r="2.4" style="fill:var(--pc0)"/>
  <circle cx="205.7" cy="200.7" r="2.4" style="fill:var(--pc0)"/>
  <circle cx="205.7" cy="180.2" r="2.4" style="fill:var(--pc0)"/>
  <circle cx="205.7" cy="159.8" r="2.4" style="fill:var(--pc0)"/>
  <circle cx="205.7" cy="139.3" r="2.4" style="fill:var(--pc0)"/>
  <circle cx="205.7" cy="149.5" r="9" style="fill:var(--bg);stroke:var(--pc0);stroke-width:2.4"/><text x="205.7" y="153.0" text-anchor="middle" style="fill:var(--text);font:bold 10px var(--sx-sans)">1</text>
  <circle cx="110.2" cy="118.9" r="9" style="fill:var(--bg);stroke:var(--pc1);stroke-width:2.4"/><text x="110.2" y="122.4" text-anchor="middle" style="fill:var(--text);font:bold 10px var(--sx-sans)">2</text>
  <circle cx="273.9" cy="251.8" r="9" style="fill:var(--bg);stroke:var(--pc2);stroke-width:2.4"/><text x="273.9" y="255.3" text-anchor="middle" style="fill:var(--text);font:bold 10px var(--sx-sans)">3</text>
  <circle cx="48.9" cy="279.1" r="9" style="fill:var(--bg);stroke:var(--pc3);stroke-width:2.4"/><text x="48.9" y="282.6" text-anchor="middle" style="fill:var(--text);font:bold 10px var(--sx-sans)">4</text>
  <text x="360" y="38" class="lbl rowname" style="fill:var(--text);font-weight:bold">One grid per group</text>
  <text x="360" y="56" class="lbl">Each square reaches its group's largest weight,</text>
  <text x="360" y="72" class="lbl">and its 16 dots are that group's levels.</text>
  <rect x="360" y="94" width="12" height="12" style="fill:none;stroke:var(--pc0);stroke-width:1.6"/>
  <text x="380" y="104" class="lbl" style="fill:var(--text)">Group 1: (0.45, 0.3), gap between levels 0.30</text>
  <rect x="360" y="118" width="12" height="12" style="fill:none;stroke:var(--pc1);stroke-width:1.6"/>
  <text x="380" y="128" class="lbl" style="fill:var(--text)">Group 2: (-0.95, 0.75), gap between levels 0.63</text>
  <rect x="360" y="142" width="12" height="12" style="fill:none;stroke:var(--pc2);stroke-width:1.6"/>
  <text x="380" y="152" class="lbl" style="fill:var(--text)">Group 3: (1.45, -1.2), gap between levels 0.97</text>
  <rect x="360" y="166" width="12" height="12" style="fill:none;stroke:var(--pc3);stroke-width:1.6"/>
  <text x="380" y="176" class="lbl" style="fill:var(--text)">Group 4: (-1.85, -1.6), gap between levels 1.23</text>
  <text x="360" y="218" class="lbl">Four groups, four different grids:</text>
  <text x="360" y="234" class="lbl">every group would have to carry its own levels.</text>
  </svg>
</figure>

<p>That is the problem steps 1 and 2 leave us with, and we can now solve it. Evenly spaced levels are a poor fit for rotated weights, and storing a fresh set of levels for every group would eat most of the savings (the numbers are in "Taking stock" below).</p>

<p>The arithmetic is short. Take groups of \(G\) weights, \(b\)-bit indices, and \(c\)-bit numbers (\(c = 32\) here). Anything stored once for the whole model is negligible, so what counts is what is stored for every group:</p>
\[ \begin{aligned} \text{shared codebook:}\quad & b + \frac{c}{G} \\ \text{fresh codebook per group:}\quad & b + \frac{2^b\,c}{G} \end{aligned} \]

<figure class="widget wide">
  <figcaption><strong>What is stored for one group of 64 weights.</strong> The same three kinds of data, drawn in proportion: the indices (blue), the group's scale (gold) and a codebook of 16 levels (red).</figcaption>
  <svg class="sx-sz" viewBox="0 0 640 200" role="img" aria-label="Two stacked bars, drawn to scale, of what is stored for one group of 64 weights: with a shared codebook, 256 bits of indices and a 32-bit scale; with a fresh codebook, 256 bits of indices and 512 bits of codebook">
  <text x="10.0" y="18" text-anchor="start" class="lbl" style="fill:var(--text);font-weight:bold;">Shared codebook: 288 bits per group, 4.5 bits per weight</text>
  <rect x="10" y="34" width="184.3" height="36" style="fill:var(--sx-blue)"/>
  <rect x="194.3" y="34" width="23.0" height="36" style="fill:var(--sx-gold)"/>
  <rect x="231.4" y="34" width="368.6" height="36" style="fill:none;stroke:var(--sx-red);stroke-width:2;stroke-dasharray:5 4"/>
  <text x="16.0" y="56" text-anchor="start" class="lbl" style="fill:#1a1a1a;">indices: 64 × 4 = 256 bits</text>
  <text x="205.8" y="85" text-anchor="middle" class="lbl" style="fill:var(--text);">scale: 32 bits</text>
  <text x="415.7" y="56" text-anchor="middle" class="lbl" style="fill:var(--text);">codebook: 16 × 32 = 512 bits, stored once</text>
  <text x="415.7" y="85" text-anchor="middle" class="lbl" style="fill:var(--text);">for the whole model, not per group</text>
  <text x="10.0" y="116" text-anchor="start" class="lbl" style="fill:var(--text);font-weight:bold;">Fresh codebook per group: 768 bits per group, 12 bits per weight</text>
  <rect x="10" y="132" width="184.3" height="36" style="fill:var(--sx-blue)"/>
  <rect x="194.3" y="132" width="368.6" height="36" style="fill:var(--sx-red)"/>
  <text x="16.0" y="154" text-anchor="start" class="lbl" style="fill:#1a1a1a;">indices: 64 × 4 = 256 bits</text>
  <text x="378.6" y="154" text-anchor="middle" class="lbl" style="fill:#1a1a1a;">its own codebook: 16 × 32 = 512 bits</text>
  <text x="10.0" y="190" text-anchor="start" class="lbl" style="fill:var(--text);">Both bars are drawn to the same scale. The fresh codebook replaces the scale.</text>
</svg>
</figure>


<ul>
<li>The shared scheme pays for one scale per group. The fresh scheme pays for \(2^b\) levels per group instead, which is \(2^b\) times as much: with \(b = 4\), sixteen times.</li>
<li>The fresh codebook's cost per weight equals the indices' own \(b\) bits when \(G = 2^b c / b\), which is 128 for \(b = 4\). Below that size, the codebooks outweigh the data they describe.</li>
<li>To keep the fresh codebooks under 10% of the indices, the group would need \(G \ge 10 \cdot 2^b c / b\), which is 1,280 weights for \(b = 4\). But groups have to stay small for step 1 to work: an outlier spoils its whole group, so a big group means more weights spoiled.</li>
<li>The same logic rules out a different rotation for every group. A dense \(G \times G\) matrix costs \(G^2 c\) bits per group, which is \(G c\) bits per weight, always far more than \(b\). A single Hadamard matrix, generated by a rule, costs 0.</li>
</ul>
<p>So sharing is what makes small groups affordable: each group may only pay for a single scale.</p>

<p>Start with the shape of the values. Trained weights are usually roughly bell-shaped, as one would expect: they start out as random Gaussian numbers, and training adds up many small nudges. Here are the real weights of SmolLM2. Each group is first divided by its length, so that every group is measured on the same scale:</p>

<figure class="widget wide" data-widget="hist" data-mode="single">
  <figcaption><strong>SmolLM2's weights as a histogram.</strong> Each bar counts the weights in a narrow range of values, measured in standard deviations (σ) after dividing each group by its length. The dashed curve is an ideal bell curve.</figcaption>
  <div class="sx-controls">
    <span class="sx-seg" role="group" aria-label="Which weights"><button data-cls="all" aria-pressed="true">all layers</button><button data-cls="attention" aria-pressed="false">attention</button><button data-cls="mlp" aria-pressed="false">feed-forward</button><button data-cls="embedding" aria-pressed="false">embedding</button></span>
    <label>Weights per group <input type="range" min="0" max="3" step="1" value="3" data-k="g"> <output data-o="g"></output></label>
  </div>
  <svg class="sx-ol" viewBox="0 0 640 200" role="img" aria-label="Histogram of SmolLM2's weights after dividing each group by its length, with a bell curve drawn over it"></svg>
  <p class="sx-note" aria-live="polite">&nbsp;</p>
</figure>

<p>For groups of 64, the attention and feed-forward weights come close to a bell curve, with a kurtosis of 3.2 and 3.1 (a bell curve has 3). Dividing by the group's length does much of the work.<span class="sidenote-wrap"><label for="sn-4" class="sidenote-number"></label><input type="checkbox" id="sn-4" class="sidenote-toggle"><span class="sidenote">The embedding is the exception, with a kurtosis of 5.2: a sharper peak and longer tails.</span></span></p>

<details class="detour">
<summary>Detour: does the rotation make them even more bell-shaped?</summary>

<p>As one would expect, yes. Each rotated weight is a mix of all the weights in its group, so by the <a href="https://en.wikipedia.org/wiki/Central_limit_theorem">central limit theorem</a> the values pile up in a bell curve even when the originals do not. Here are the same weights before and after rotating each group:</p>

<figure class="widget wide" data-widget="hist">
  <figcaption><strong>SmolLM2's weights, before and after rotation.</strong> The same weights appear in both panels; the right one has each group multiplied by the Hadamard matrix. Switch on the log scale to see the tails, where the counts are tiny, or switch off the division to see what the groups' different sizes do.</figcaption>
  <div class="sx-controls">
    <span class="sx-seg" role="group" aria-label="Which weights"><button data-cls="all" aria-pressed="true">all layers</button><button data-cls="attention" aria-pressed="false">attention</button><button data-cls="mlp" aria-pressed="false">feed-forward</button><button data-cls="embedding" aria-pressed="false">embedding</button></span>
    <label>Weights per group <input type="range" min="0" max="3" step="1" value="3" data-k="g"> <output data-o="g"></output></label>
    <button data-k="norm" aria-pressed="true">divide each group by its length</button>
    <button data-k="log" aria-pressed="false">log scale</button>
  </div>
  <svg class="sx-ol" viewBox="0 0 640 190" role="img" aria-label="Two histograms of SmolLM2's weights, before and after rotating each group, each with a bell curve drawn over it"></svg>
  <p class="sx-note" aria-live="polite">&nbsp;</p>
  <table class="sx-stat"></table>
</figure>

<p>For groups of 64:</p>
<ul>
<li><strong>Rotation trims the tails and evens out the layers.</strong> Every part lands at a kurtosis of 2.9, which is exactly what a random direction in 64 dimensions gives (\(3G/(G+2)\)), so it cannot get more bell-like than that. The share of weights beyond 3σ falls from 0.50% to 0.20%, and the largest value from 7.9σ to 5.5σ.</li>
<li><strong>It helps most where the weights are least bell-shaped.</strong> The embedding goes from a kurtosis of 5.2 to 2.9. The same holds for groups with an outlier, as in the toy examples earlier. So the rotation is less a source of the bell shape than a guarantee of it.</li>
<li><strong>Without dividing by the length, the picture is much worse.</strong> Groups differ a lot in size, so the values are a mixture of many bell curves of different widths, which has heavy tails (kurtosis 5.4, largest value 51σ). Rotating helps (3.7, 25σ) but cannot make the groups alike: it mixes the weights inside a group and leaves the group's size alone. That is why the length is divided out first, and stored as the scale.</li>
<li><strong>Small groups show little.</strong> In a group of 8 no value can exceed \(\sqrt{8} = 2.8\sigma\), so there are no tails to trim. Slide the group size up to see the effect grow.</li>
</ul>
</details>

<p>That shape is what the next steps rely on:</p>
<ul>
<li><strong>Evenly spaced levels suit this badly.</strong> They are wasted on the tails, where almost nothing lands, and leave the crowded middle coarsely rounded.</li>
<li><strong>Because the shape is known in advance, the levels can be designed once, ahead of time.</strong> They need only be dense where the bell is tall and sparse where it is short.</li>
<li><strong>That only works if every group looks the same,</strong> so each group is divided by its own length first. Then the groups differ only in the scale we store, and one shared set of levels (the codebook) serves them all, with nothing extra to store per group.<span class="sidenote-wrap"><label for="sn-3" class="sidenote-number"></label><input type="checkbox" id="sn-3" class="sidenote-toggle"><span class="sidenote">A side benefit is speed. A 4-bit codebook has only 16 entries, which fit in one CPU register, so many weights can be looked up at once (step 4). Speed is not why the codebook exists: the aim of these steps is a smaller model.</span></span></li>
</ul>

<p>So the step has these parts:</p>
<ul>
<li>Divide each group by its length, which is stored as the group's scale. What is left is a direction, so every group is on the same footing.</li>
<li>The levels come from <a href="https://en.wikipedia.org/wiki/Lloyd%27s_algorithm">Lloyd's algorithm</a> run on a Gaussian: dense near zero, where most values are, and sparse in the tails. That set is the codebook.</li>
<li>Each weight stores the 4-bit index of its nearest level.</li>
<li>With 2 bits there are only 4 levels. Whistle mixes 2- and 4-bit layers.</li>
</ul>

<p>To see how the levels are found, step through Lloyd's algorithm. The bars are a pile of rotated values, a bell curve, and the levels start out evenly spaced:</p>

<figure class="widget wide" data-widget="lloyd">
  <figcaption><strong>Finding the levels with Lloyd's algorithm.</strong> Gold ticks are the levels, and the dashed lines between them cut the number line into the zone each level serves. Each step sends every value to its nearest level, then moves each level to the average of the values it got.</figcaption>
  <div class="sx-controls">
    <label>Bits <input type="range" min="2" max="4" step="1" value="2" data-k="bits"> <output data-o="bits"></output></label>
    <button data-act="next">next step</button>
    <button data-act="run">run to the end</button>
    <button data-act="reset">reset</button>
  </div>
  <svg class="sx-ll" viewBox="0 0 640 230" role="img" aria-label="A bell curve of values with quantization levels that move toward where the values are, one step at a time"></svg>
  <p class="sx-note sx-readout" aria-live="polite">&nbsp;</p>
</figure>

<p>Now the same idea on the two-weight groups from step 2. The length of each group is divided out, so the dots sit on a circle of length 1, and one grid is shared by every group:</p>

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

<p id="step-4" data-toc="Step 4: never rebuild the weights"><strong>Step 4: never rebuild the weights.</strong></p>
<ul>
<li><strong>The problem:</strong> steps 2 and 3 store rotated, rounded weights. To use one you'd normally decode it: look up its level, multiply by the length, rotate back.</li>
<li>Doing that for 135 million weights per word would be slow on a 2010 CPU, and it would rebuild the full-size weights we worked to avoid keeping.</li>
<li><strong>The way out:</strong> a layer only needs dot products, and rotating both sides of a <a href="https://en.wikipedia.org/wiki/Dot_product">dot product</a> doesn't change it. So rotate the other side, the activations, instead, and never touch the weights.</li>
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

<p>Here is the shortcut with real numbers. Both routes give the same answer, but rotating the activations once is much cheaper when many rows share them:</p>

<figure class="widget wide" data-widget="reuse">
  <figcaption><strong>Rotate the activations, not the weights.</strong> The top shows one group of 8 weights and the 8 activations they meet. The bottom counts the operations for groups of 64 when a matrix has many rows.</figcaption>
  <div class="sx-controls">
    <button data-act="new">new numbers</button>
    <label>Rows in the matrix <input type="range" min="0" max="12" step="1" value="8" data-k="rows"> <output data-o="rows"></output></label>
  </div>
  <div class="sx-reuse"></div>
  <svg class="sx-cost" viewBox="0 0 640 120" role="img" aria-label="Bars comparing the operations needed when each row's weights are rotated back, and when the activations are rotated once"></svg>
  <p class="sx-note sx-readout" aria-live="polite">&nbsp;</p>
</figure>

<p>The rotation itself is cheap thanks to the <a href="https://en.wikipedia.org/wiki/Fast_Walsh%E2%80%93Hadamard_transform">fast Walsh–Hadamard transform</a>. Because the matrix is built by doubling, it can be applied in \(\log_2 n\) rounds of add-and-subtract on pairs, the same <a href="https://en.wikipedia.org/wiki/Butterfly_diagram">butterfly</a> pattern as the FFT, with no multiplications:</p>

<figure class="widget wide" data-widget="fwht">
  <figcaption><strong>The fast transform on 8 numbers.</strong> Each round replaces pairs (a, b) with (a + b, a − b). Step through the rounds.</figcaption>
  <div class="sx-controls"><button data-act="next">next round ▶</button><button data-act="reset">reset</button></div>
  <div class="sx-fwht"></div>
  <p class="sx-note" aria-live="polite">&nbsp;</p>
</figure>

<p id="stock" data-toc="Taking stock: what the steps buy"><strong>Taking stock: what the steps buy, and what they cost.</strong> All four steps are in place. Here is the whole pipeline on one group, then its gains and its price:</p>

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

<p>The shared parts are almost free, and the alternatives are not. Per weight, for groups of 64 and 32-bit numbers:</p>
<div class="wide"><table>
<thead><tr><th>What is stored</th><th class="num">Bits per weight</th><th class="num">SmolLM2</th></tr></thead>
<tbody>
<tr><td>32-bit floats, for reference</td><td class="num">32</td><td class="num">538 MB</td></tr>
<tr><td><strong>What we do:</strong> 4-bit indices, one scale per group, one Hadamard matrix and one codebook for everything</td><td class="num">4.5</td><td class="num">76 MB</td></tr>
<tr><td>A fresh 16-level codebook for every group instead of the shared one (it replaces the scale: 16 numbers instead of 1)</td><td class="num">12</td><td class="num">202 MB</td></tr>
<tr><td>A different dense random rotation for every group, instead of the Hadamard matrix (\(64\times 64\) numbers each)</td><td class="num">about 2,050</td><td class="num">about 34 GB</td></tr>
</tbody>
</table></div>
<ul>
<li><strong>The shared codebook costs 64 bytes</strong> (16 numbers) for the whole model, and the Hadamard matrix costs nothing, because the doubling rule generates it.</li>
<li><strong>A fresh codebook per group</strong> would fit each group better, but its 16 numbers are twice the size of the group's 64 four-bit indices, so the model would be 2.7 times bigger and would leave little of the 256 MB for anything else.</li>
<li><strong>A different dense rotation per group</strong> would cost 512 times more than the weights it rotates, and could not be applied cheaply either.</li>
</ul>

<p>Other choices cost other amounts. Try a few and compare with the iPod's 256 MB of RAM:</p>

<figure class="widget wide" data-widget="sizecalc">
  <figcaption><strong>What a model costs to store.</strong> 134.5 million weights, each taking a number of bits, plus one 32-bit scale for every group.</figcaption>
  <div class="sx-controls">
    <label>Bits per weight <input type="range" min="1" max="8" step="1" value="4" data-k="bits"> <output data-o="bits"></output></label>
    <label>Weights per group <input type="range" min="0" max="4" step="1" value="2" data-k="g"> <output data-o="g"></output></label>
  </div>
  <svg class="sx-sz" viewBox="0 0 640 150" role="img" aria-label="Bars comparing the size of the model as 32-bit floats, at the chosen bits and group size, and the iPod's RAM"></svg>
  <p class="sx-note sx-readout" aria-live="polite">&nbsp;</p>
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
