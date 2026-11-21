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

<p><strong>First, plain quantization.</strong> A weight is a number such as 0.137, and a float stores it in 32 bits. Quantization stores a rougher copy instead:</p>
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

<p><strong>Step 1: cut each row into groups.</strong></p>
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
  <figcaption><strong>Why weights are grouped.</strong> Each cell is one weight (blue negative, red positive). White lines separate the rows and the groups within each row, and each group gets its own scale: the number printed on its cells, which is its largest weight (the plain scheme; Whistle uses the group's length instead). Every row has its own groups and scales. Outliers have a gold outline. Turn them off to see how much of the effect they cause.</figcaption>
  <div class="sx-controls">
    <label>Groups per row <input type="range" min="0" max="4" step="1" value="0" data-k="g"> <output data-o="g"></output></label>
    <label><input type="checkbox" checked data-k="out"> outliers</label>
    <button data-act="new">New matrix</button>
  </div>
  <svg class="sx-gr" data-v="w" role="img" aria-label="Heatmap of a toy weight matrix with group boundaries and each group's scale printed on its cells"></svg>
  <p class="sx-gcap">Scale of each group, its largest weight (the more gold, the larger)</p>
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

<p><strong>Step 2: rotate the group.</strong> Grouping stops an outlier from spoiling its whole row, but inside its own group it still stretches the levels for the other 63 weights.</p>
<ul>
<li>What matters is how spiky the group is: \(\max_j |w_j| \,/\, \ell\), its largest weight compared with the group's overall size, which is its length \(\ell\).</li>
<li>You can't remove a spike without changing the weights.</li>
<li>But you can change the axes you write them against.</li>
</ul>

<p>Start with the smallest case: a group of just two weights, drawn as a point on a plane:</p>
<ul>
<li>The 2-bit levels, four per axis, form a grid inside a square that just reaches the point's largest coordinate.</li>
<li>A point close to an axis has one big weight and one tiny one, so its square must be as large as the point is long, and the grid is coarse.</li>
<li>A point on the diagonal has two equal coordinates, which is as flat as it gets: the square is smaller and the grid finer.</li>
</ul>

<figure class="widget wide" data-widget="rot2d">
  <figcaption><strong>Rotating groups of two weights.</strong> Each dot is one group of two weights, drawn as a point on a circle of length 1 (the group's length is divided out, as in step 1), and each group has its own color. Hollow dots mark where the groups started, and filled dots are where the rotation has taken them. First, make up some groups:</figcaption>
  <div class="sx-rowlabel sx-block">Mock groups</div>
  <div class="sx-opts">
    <button data-at="axes" aria-pressed="true"><strong>One big weight each (i.e., has outlier)</strong><span>A big weight and a small one, so a group starts near an axis.</span></button>
    <button data-at="diag" aria-pressed="false"><strong>Two similar weights each (i.e., no outlier)</strong><span>Two weights of about the same size, so a group starts near a diagonal.</span></button>
  </div>
  <div class="sx-controls">
    <label>Number of groups <input type="range" min="1" max="8" step="1" value="3" data-k="n"> <output data-o="n"></output></label>
    <label>Spiky groups <input type="range" min="0" max="100" step="1" value="100" data-k="sp"> <output data-o="sp"></output></label>
    <button data-act="new">new points</button>
  </div>
  <p class="sx-hint">How tightly the groups hug their starting place: at 100% every group is within 10° of it, and at 0% the directions are spread evenly round the circle.</p>
  <p class="sx-cap2">A square marks the range of a group's levels, 4 per axis (2 bits). The small dots inside it are the 16 values that group can be stored as: each of its two coordinates is rounded to the nearest level, and a line in the group's color shows where it lands. Groups that are alike have nearly the same square, so they can lie on top of each other: a colored chip above each square's top-left corner counts them, and rotating pulls them apart. Click a dot to see its numbers below. Choose how the levels are placed:</p>
  <div class="sx-rowlabel sx-block">Levels</div>
  <div class="sx-opts">
    <button data-mode="plain" aria-pressed="true"><strong>Reach each group's largest weight</strong><span>Step 1: every group has its own scale, so each gets its own square in its own color, drawn to just reach its largest coordinate, with the evenly spaced levels of plain quantization.</span></button>
    <button data-mode="fixed" aria-pressed="false"><strong>One fixed grid for all groups</strong><span>Step 3's idea: the length is divided out and one grid (a single gold square) is shared by every group, here sized for a perfectly flat group (both coordinates 0.71). Whistle's grid is fixed too, but Gaussian-shaped and built for groups of 64.</span></button>
  </div>
  <p class="sx-cap2">The curve shows, at every angle, the largest weight as a share of the group's length, averaged over the groups. Lower is flatter, and the rounding error follows it. Now rotate. The camera switch changes the viewpoint: off, the camera stays with the axes and the points move; on, it stays with the points, and the axes and squares turn the other way.</p>
  <div class="sx-rowlabel sx-block">Rotation</div>
  <div class="sx-controls">
    <label>Angle <input type="range" min="0" max="90" step="1" value="0" data-k="deg"> <output data-o="deg"></output></label>
    <button data-act="reset">reset</button>
    <button data-act="follow" aria-pressed="false">camera follows the points</button>
  </div>
  <svg class="sx-r2" viewBox="0 0 640 300" role="img" aria-label="Points on a circle with the square of quantization levels around the selected point, and a curve of average rounding error against rotation angle"></svg>
  <p class="sx-note sx-readout" aria-live="polite">&nbsp;</p>
  <p class="sx-note">The rotation slider is only an animation: in practice a rotation is applied once, all at once.</p>
</figure>

<p>With three weights, the same picture is a point in 3D space, one weight per axis:</p>
<ul>
<li>The 2-bit levels, four per axis, form a grid inside a cube that just reaches the point's largest coordinate.</li>
<li>A point close to an axis has one big weight and two tiny ones. Its cube must be as large as the point is long, so the grid is coarse.</li>
<li>Rotating the point is the same as writing it against rotated axes. The same point, with the same length, now has no dominant coordinate: the cube shrinks, the grid gets finer, and the rounding error drops.</li>
</ul>
<p>Things to try in the figure:</p>
<ul>
<li>Click a point to see its grid.</li>
<li>Drag the background to look around, or switch on "spin the view" and move the slider while the points turn. It is much easier to see how they move in space.</li>
<li>Turn the slider. At 60° the points are flattest, and at 120° they are spiky again.</li>
<li>Flip the camera switch. Off, the camera stays with the axes and the points move. On, it stays with the points, and the axes and the cube turn the other way. It is the same picture seen from two places.</li>
</ul>

<figure class="widget wide" data-widget="rot3d">
  <figcaption><strong>Rotating four groups of three weights.</strong> Each dot is one group, a point on a sphere of length 1. The cube is the range its levels must cover, with 4 levels per axis (2 bits), and the gold line goes from the point to the level it rounds to. Rotating about the diagonal by 60° turns every axis-aligned spike into a flatter point; at 120° the points are spiky again.</figcaption>
  <div class="sx-controls">
    <label>Rotate <input type="range" min="0" max="120" step="1" value="0" data-k="deg"> <output data-o="deg"></output></label>
    <button data-act="flat">60° (flattest 3×3)</button>
    <button data-act="reset">reset</button>
    <button data-act="follow" aria-pressed="false">camera follows the points</button>
    <button data-act="spin" aria-pressed="false">spin the view</button>
  </div>
  <svg class="sx-r3" viewBox="0 0 640 330" role="img" aria-label="Four points in three dimensions with the cube of quantization levels around the selected point"></svg>
  <p class="sx-note sx-readout" aria-live="polite">&nbsp;</p>
  <div class="sx-mat"></div>
  <p class="sx-note">The slider is only an animation: in practice a rotation is applied once, all at once. At 60° the rotation matrix has the flattest entries a 3×3 rotation can have, ±2/3 and ±1/3.</p>
</figure>

<p>Why this is safe:</p>
<ul>
<li><strong>Nothing is lost.</strong> A rotation keeps every point's length and can be undone exactly by rotating back, so the rounding error is the same size whichever side you measure it on.</li>
<li><strong>It costs no bits.</strong> There is nothing extra to store.</li>
</ul>
<details class="detour">
<summary>Detour: how is this different from PCA?</summary>

<p>If you have met <a href="https://en.wikipedia.org/wiki/Principal_component_analysis">principal component analysis</a>, this rotation may look familiar. PCA is also a rotation, but with the opposite goal:</p>
<div class="wide"><table>
<thead><tr><th></th><th>PCA</th><th>Hadamard matrix (introduced right after this detour)</th></tr></thead>
<tbody>
<tr><td>Chosen from</td><td>The data: the directions many vectors vary along most</td><td>Nothing, it is fixed</td></tr>
<tr><td>Effect</td><td>Piles the energy into a few coordinates</td><td>Spreads the energy evenly over all coordinates</td></tr>
<tr><td>Good for</td><td>Compressing by dropping the small coordinates</td><td>Rounding, where a dominant coordinate is the outlier we want to avoid</td></tr>
<tr><td>Needs</td><td>A rotation fitted to each layer's data, and stored</td><td>No stored matrix</td></tr>
<tr><td>Fast form</td><td>A general matrix multiply</td><td>Add-and-subtract butterfly (step 4)</td></tr>
</tbody>
</table></div>
<p>Here are both, applied to the same 24 groups of 8 weights. The second rotation is the Hadamard matrix:</p>

<figure class="widget wide" data-widget="pca">
  <figcaption><strong>PCA and the Hadamard rotation on the same groups.</strong> Each row of a grid is one group of 8 weights (blue negative, red positive). The bars show how the total energy, the sum of squares, is divided among the 8 coordinates. Pick a data set, and compare how each rotation changes the largest coordinate and the rounding error of a group.</figcaption>
  <div class="sx-controls">
    <span class="sx-seg"><button data-ds="spiky" aria-pressed="true">each group has one big weight</button><button data-ds="corr" aria-pressed="false">weights move together</button></span>
    <button data-act="new">new data</button>
  </div>
  <svg class="sx-pc" viewBox="0 0 900 285" role="img" aria-label="Three grids of 24 groups of 8 weights: as given, after PCA, and after the Hadamard rotation, with the energy per coordinate below each"></svg>
  <p class="sx-note" aria-live="polite">&nbsp;</p>
</figure>

<p>Here is the same contrast in three dimensions, where you can watch it happen:</p>
<ul>
<li>Each dot is a group of three weights, red when its 2-bit rounding error is large and blue when it is small.</li>
<li>The flattening rotation is the 60° turn about the diagonal from the figure above.</li>
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
  <p class="sx-note">The slider is only an animation. A real PCA step applies one matrix, fitted to the data, all at once. The flattening rotation is the 60° one from the figure above.</p>
</figure>

<p>Neither rotation is better in general; they are tools for different jobs. When the data has no preferred direction (the first data set), PCA's axes are close to arbitrary, so a PCA rotation can help or hurt by chance. When the weights move together (the second), PCA is exactly the wrong tool for rounding: it makes every group spikier.</p>

</details>

<p><strong>Which rotation?</strong> Many rotations would flatten a spike, as the figures above show. Whistle uses one that needs no multiplications and no stored matrix, the <a href="https://en.wikipedia.org/wiki/Hadamard_matrix">Walsh–Hadamard matrix</a>. That's a square matrix whose entries are all +1 or −1 (divided by \(\sqrt{n}\) so it keeps lengths). The 2×2 one is
\[ H_2 = \frac{1}{\sqrt{2}}\begin{bmatrix} 1 & 1 \\ 1 & -1 \end{bmatrix} \]
Each bigger one is four copies of the previous one, with the bottom-right copy negated:
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
<tr><td>3 (the 3D figure reaches about two thirds for all three axes at once)</td><td class="num">at best 58%</td></tr>
<tr><td>8</td><td class="num">35%</td></tr>
<tr><td>64</td><td class="num">12.5% (1/8)</td></tr>
<tr><td>128</td><td class="num">8.8%</td></tr>
</tbody>
</table></div>
<p>In two dimensions the Hadamard matrix is exactly the 45° rotation with its two outputs swapped, so the 2D picture shows when it helps. This is the same figure as before, with that angle marked:</p>

<figure class="widget wide" data-widget="rot2d" data-had="1">
  <figcaption><strong>The Hadamard angle.</strong> The same two-weight groups as before, now with the Hadamard matrix marked on the curve and shown next to the rotation matrix. Make up some groups, then rotate:</figcaption>
  <div class="sx-rowlabel sx-block">Mock groups</div>
  <div class="sx-opts">
    <button data-at="axes" aria-pressed="true"><strong>One big weight each (i.e., has outlier)</strong><span>A big weight and a small one, so a group starts near an axis.</span></button>
    <button data-at="diag" aria-pressed="false"><strong>Two similar weights each (i.e., no outlier)</strong><span>Two weights of about the same size, so a group starts near a diagonal.</span></button>
  </div>
  <div class="sx-controls">
    <label>Number of groups <input type="range" min="1" max="8" step="1" value="3" data-k="n"> <output data-o="n"></output></label>
    <label>Spiky groups <input type="range" min="0" max="100" step="1" value="100" data-k="sp"> <output data-o="sp"></output></label>
    <button data-act="new">new points</button>
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
    <strong>When does 45° (the Hadamard matrix) give the least spikiness?</strong> Only for certain groups, and it is worth being clear which:
    <ul>
    <li><strong>Groups with one big weight (an outlier), which start near an axis.</strong> They are as far from 45° as possible, so turning by 45° brings them to the flat direction. That is the first mock-group setting at 100%.</li>
    <li><strong>Not groups that start near a diagonal.</strong> Switch to "Two similar weights each" and the curve flips: they are already flat, and 45° turns them into spikes.</li>
    <li><strong>Not groups spread evenly in every direction.</strong> The curve is nearly flat and no angle helps on average.</li>
    </ul>
    With 64 weights the same holds. A single big weight is a spike along one axis, and the Hadamard matrix spreads it evenly over all 64 outputs. The groups it makes spikier are the ones that already look like one of its rows: a group whose 64 weights are all equal becomes a single spike. Weights with one large outlier are far more common than that, which is why Whistle uses it.
  </div>

</figure>

<p>For other group sizes the flattest a rotation can be is set by the length: each row of the matrix has length 1, so its largest entry is at least \(1/\sqrt{n}\). The Hadamard matrix reaches that bound whenever it exists:</p>
<div class="wide"><table>
<thead><tr><th>Group size \(n\)</th><th class="num">Smallest largest entry</th><th>Which matrix gets there</th></tr></thead>
<tbody>
<tr><td>2</td><td class="num">0.71</td><td>The Hadamard matrix, exactly: the 45° rotation above</td></tr>
<tr><td>3</td><td class="num">0.67</td><td>No Hadamard matrix of this size exists. The 60° rotation from the 3D figure is the flattest we found (a numerical search agrees)</td></tr>
<tr><td>4</td><td class="num">0.5</td><td>The 4×4 Hadamard matrix</td></tr>
<tr><td>8</td><td class="num">0.35</td><td>The 8×8 Hadamard matrix</td></tr>
<tr><td>64</td><td class="num">0.125</td><td>The 64×64 Hadamard matrix, which is why groups of 64 (or 128) are a natural size</td></tr>
</tbody>
</table></div>

<p><strong>Step 3: snap to a codebook made for bell curves.</strong></p>
<ul>
<li>Rotated groups all have roughly the same bell shape (once divided by their length), so one set of levels can serve all of them.</li>
<li>The levels come from <a href="https://en.wikipedia.org/wiki/Lloyd%27s_algorithm">Lloyd's algorithm</a> run on a Gaussian: dense near zero, where most values are, and sparse in the tails. That set is the codebook.</li>
<li>Each weight stores the 4-bit index of its nearest level.</li>
<li>With 2 bits there are only 4 levels. Whistle mixes 2- and 4-bit layers.</li>
</ul>

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

<p><strong>Step 4: never rebuild the weights.</strong></p>
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
