---
title: Rolling Dice on a $60 handheld
date: '2026-05-23T11:01:00Z'
---

In the last post, "[Porting Raylib to a $60 GBA clone](https://medium.com/p/6a22c268ff15)", I described how I convinced [Raylib](https://www.raylib.com/) to **draw 3D scenes** on a budget handheld — the [Miyoo Mini Flip](https://lomiyoo.com/products/miyoo-mini-flip) (MMF) — that has **no GPU** whatsoever. The trick was pairing Raylib's bare-framebuffer platform (`PLATFORM_MEMORY`) with [TinyGL](https://github.com/tslmy/tinygl/tree/mmf), a software OpenGL 1.1 renderer that skips the expensive `glReadPixels` copy step. The result: **25 FPS** on a dual-core ARM Cortex-A7.

That was the framework; This post is about building **an actual app** on top of it. Where we left off, I teased that the end goal was porting [my THREE.js dice roller](https://github.com/tslmy/threejs-dice) to this little device. The web version uses a browser's GPU, a physics engine written in JavaScript, and environment lighting from an HDR panorama. The MMF has none of those luxuries. The question was: how much of that visual quality could survive the translation to a CPU-only ARM chip?

More than I expected, it turns out.

![](/vault-assets/demo%20of%20dice%20roller%20on%20Miyoo%20Mini%20Flip.gif)

# Defining the dice: platonic solids in code

The first job was describing the dice in a language the renderer understood. The web version had this in JavaScript; I translated it into a C++ header file.

A die is a **platonic solid**: a shape where every face is the same regular polygon. The d4 is a _tetrahedron_ (4 triangular faces), the d6 a _cube_, d8 an _octahedron_, d10 a _pentagonal trapezohedron_, d12 a _dodecahedron_, and d20 an _icosahedron_.

These "-hedron" words took me right back to the crystallography course I took in undergrad when I was studying nanomaterials. I have to say, it's considerably more entertaining to encounter icosahedra and dodecahedra in a tabletop games context than in crystal lattice diagrams.

```cpp
static const DiceDef DICE_DEFS[NUM_DICE_TYPES] = {
    { "d4",  4, /* scaleFactor */ 1.20f, /* invertUpside */ true,  ... },
    { "d6",  6, 0.90f, false, ... },
    ...
    { "d20", 20, 1.00f, false, ... },
};
```

Each `DiceDef` stores the "canonical" vertex coordinates (typically in a −1 to +1 cube), a scale factor to make all dice look visually proportional, and the faces as ordered lists of vertex indices. The face ordering, called **winding order**, determines which side is the front. Get it wrong and the die looks inside-out.

![](/vault-assets/dice%20vertex%20geometry.png)

## The d4 is weird

The d4 has [two common designs](https://www.dicedragons.co.uk/blogs/dice-advice/how-to-read-a-d4): **top-numbered** (you read the apex vertex) and **bottom-numbered** (you read the face resting on the table). The THREE.js version was top-numbered, since it placed digits on the three vertices surrounding each face. That was a natural fit for a high-resolution screen.

On the MMF's 750×560 framebuffer, squeezing three numbers onto a tiny triangular face looked terrible. So I switched to a **bottom-numbered design** in this C++ port: you read the face pointing downward, and the die stores a single centered digit per face. The `invertUpside = true` flag tells the face-detection code to look for the face whose normal points most *downward*, not upward. More on that when we get to face detection.

# Making them fall: Bullet3 physics

A dice roller without physics is just a random number generator with a pretty skin. I added [Bullet3](https://github.com/bulletphysics/bullet3) for the simulation.

There is actually a **genealogical thread** connecting the THREE.js version to this one. The web dice roller used [cannon.js](https://github.com/pmndrs/cannon-es) for physics — and if you follow `cannon.js` back through its ancestry (like I did in the side note of [this blog post](https://blog.myli.page/lets-write-an-ai-keeper-for-call-of-cthulhu-part-iii-make-a-3d-scene-b437d00c7e3a)), it is a JavaScript port of... Bullet. So in porting the dice roller to C++, we are paying tribute to the original ecosystem by returning to the source.

Bullet3's job is straightforward: each die is a **rigid body** — an object with mass, position, rotation, and velocity. Every frame the engine advances the simulation by one timestep. It applies gravity, finds where bodies overlap (collision detection), and resolves those overlaps with realistic contact forces (bounce and friction).

For collision detection, Bullet uses a **convex hull** of each die's vertices. Because all platonic solids are convex, this is exact — not an approximation. It's also the fastest possible collision shape Bullet supports[^1]. The scene is thus minimal:

- One infinite flat plane (the floor, mass = 0, static)
- Up to 12 convex-hull rigid bodies (the dice, mass = 1)

**Spawning a throw** means placing each die above the table at a random position, giving it a random rotation and some angular velocity, and letting Bullet take over:

```cpp
d.body->setAngularVelocity(btVector3(RandF(-8,8), RandF(-8,8), RandF(-8,8)));
d.body->setLinearVelocity (btVector3(RandF(-2,2), RandF(-1,1), RandF(-2,2)));
world->addRigidBody(d.body);
```

The floor and dice exist **twice** in the codebase: once as Bullet collision objects, and once as Raylib geometry for rendering. The physics floor is an infinite mathematical plane; the visual floor is a textured quad. They share the same ground height so dice don't visually float above where they land.

## Detecting when a die has settled — and reading the result

The JavaScript-based `threejs-dice` library takes an interesting shortcut with outcomes: you can **prescribe** which number each die will show before throwing. The trick is clever: let the physics simulation run to completion in an instant (which is much cheaper than the rendering 3D), observe which face landed up, and *then* paint the desired number onto that face. The rendered trajectory is real; only the paint job is rigged.

This C++ port takes a more authentic approach: both physics and rendering happen frame-by-frame, simultaneously. There is no "run ahead" — the simulation and the visuals are always in sync. I did vibe-code a "rig mode"[^2], but it works after settling, by physically rotating the die to face the target upward. No post-effect paint job.

After throwing, the game polls each die every frame for stillness:

```cpp
bool IsDieSettled(const ActiveDie& d) {
    btVector3 v = d.body->getLinearVelocity();
    btVector3 w = d.body->getAngularVelocity();
    return v.length() < 0.3f && w.length() < 0.3f;
}
```

A die is "settled" after it has been nearly motionless for 30 consecutive frames (~1 second at 30 FPS). Only then do we read its face-up value.

Face detection works by examining the die's current rotation. For each face, we compute its outward **normal** (a perpendicular vector) and take the **dot product** with the world up-direction `(0, 1, 0)`. The face with the highest dot product is pointing most skyward — that's the face you rolled. For the d4, `invertUpside = true` flips the query to `(0, −1, 0)`, finding the face closest to the ground.

# The rendering pipeline: ten layers, painted back to front

With positions coming from Bullet and geometry from the definitions, the renderer's job is to turn all of that into pixels. The pipeline draws ten layers every frame, strictly in this order:

1. **Skybox** — the background
2. **Floor** — the pre-lit hardwood quad
3. **Reflections** — semi-transparent upside-down copies of the dice
4. **Shadows** — dark silhouettes projected onto the floor
5. **Dice faces** — translucent, shaded geometry
6. **Number decals** — digit textures painted on each visible face
7. **Edge wireframes** — subtle white outlines
8. **Scratch overlay** — fine surface scratches lit in real time
9. **Bloom halos** — specular glow (off by default; explained later)
10. **Post-processing** — per-pixel bloom boost + depth fog

**Order matters a lot here**. The dice are semi-transparent, so the GPU's depth buffer can't sort them — that only works for opaque objects. Instead the renderer sorts all dice back-to-front before drawing (the [painter's algorithm](https://en.wikipedia.org/wiki/Painter%27s_algorithm)) and disables depth writes during the dice pass to prevent Z-fighting with the overlays.

![](/vault-assets/demo.gif)

## Shadows and reflections

Two of the most grounding effects — things that make the dice feel like they exist in a real space — are the projected shadows and floor reflections.

**Projected shadows** work by "flattening" each die onto the floor along the key light direction, like tracing a silhouette cast by a flashlight. For each die, we interpolate a ray passing each vertex to the floor, compute the convex hull of the projected points, and draw it as a dark polygon. The opacity fades as dice hang higher in the air, so that falling dice cast paler shadows than ones resting on the table.

Edges further away from the floor should, in reality, cast fuzzier shadows. Unfortunately, blurs are too heavy to compute without a GPU. To mimic the effect, we draw a [penumbra](https://en.wikipedia.org/wiki/Umbra,_penumbra_and_antumbra), which is a second, slightly larger and more transparent polygon around the outer edge. It fakes the soft falloff at the shadow boundary. But it looked too fake (since we **can't do blurring** -- more details later), so I turned it off by default.

**Floor reflections** are drawn as an upside-down, y-flipped copy of each die, slightly transparent and blended into the floor surface. That's not a reflection in the optics sense, not even the "[planar reflection](https://docs.vulkan.org/tutorial/latest/Building_a_Simple_Engine/Advanced_Topics/Planar_Reflections.html)" trick you'd find in early video games (where you'd place another camera in the "mirror world"). Instead, it is literally the same polyhedrons drawn with `scale.y = -1` and reduced alpha. The cheap trick works because the floor is flat and the camera is never below the surface.

## Lighting: a studio in a header file

Real-world photography and film use a "key + fill" lighting setup. The **key light** is the main, bright source that creates defining shadows and highlights. The **fill light** is softer and comes from the opposite direction, preventing shadows from going pitch black.

Note that in my older THREE.js implementation, the fill light was implemented as an [ambient light](https://threejs.org/docs/#AmbientLight), which has no direction. In this Raylib implementation, however, both lights are directional. Conceptually, the two lights are infinitely far (like the sun), so we only need one *unit* vector to describe their direction. Thus, lighting a vertex is a dot product: a surface facing the light is bright; one facing away is dark.

I chose to make the fill light directional this time because I wanted to try something else with the **environment lighting**. In the JavaScript edition, THREE.js was able to use the brightness channel in a HDR photo for luminance from the skybox. I never studied how THREE.js implemented it, but since TinyGL doesn't support it anyway, I wanted to try an approximation called **Spherical Harmonics (SH)** this time.

SH is a mathematical compression of the light coming from all directions[^3]. At "level 2" (L2), SH captures:

- (L0) the overall brightness,
- (L1) which direction is brightest, and
- (L2) broad color variation across the environment,

using just 27 floating-point numbers. At runtime, evaluating the SH for a given surface normal is just 9 multiplications & additions, which is blazing fast. The coefficients are computed from the skybox image at build time using `cmgen`, so the device never has to process the panorama at runtime.

![](/vault-assets/Pasted%20image%2020260524163238.png)
*Spherical harmonics lobes. Source: Hellingspaul, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0), via [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Spherical_harmonics_lobes.jpg)*

To be candid, I put SH in for fun more than for visual effects. The "photo booth" skybox I used is too monochromatic to provide much color variation. The ambient contribution is subtly nice but nothing to write home about. I was curious about how the concept worked in a totally different context, as the first time I learned about SH was in a quantum mechanics class back in college. In that context, SH described the **spatial probability distribution** of where an electron is likely to be found in atoms. I can't say which is more mentally demanding, atomic physics or computer graphics.

## The glass look: Fresnel and near-invisibility

The dice are modeled after glass polyhedra. Real glass is nearly transparent when you look straight at it, but becomes mirror-like at glancing angles. That's the [Fresnel effect](https://www.dorian-iten.com/fresnel/). It is one of the defining visual signatures of glass and water.

The Schlick approximation[^4] gives a cheap formula: $F ≈ F₀ + (1 − F₀)(1 − cos θ)⁵$, where θ is the angle between the surface normal and view direction, and F₀ ≈ 0.04 for glass with an index of refraction of ~1.52.

The base opacity of each die face is set to `DICE_ALPHA = 12` — essentially invisible. Fresnel then boosts the opacity at silhouette edges up toward full opacity. The result is a die that looks like a solid object at its edges but nearly disappears when you look at its face head-on.

This same Fresnel term also drives a rim glow at silhouette edges. A [Blinn-Phong specular](https://en.wikipedia.org/wiki/Blinn%E2%80%93Phong_reflection_model) with a tight power-16 exponent creates the shiny hotspot. A clearcoat layer (power-32) adds a secondary, even tighter gloss. With a bit of tessellation[^7] on the faces, the combination gives the dice a convincing polished-glass appearance, with zero ray-tracing.

## The skybox: a cylinder you live inside

The web version used a proper spherical panorama for the skybox. OpenGL 1.1 has no concept of a cubemap or a sphere with infinite distance. So the skybox is faked as a large cylinder textured with horizontal strips sliced from the original panorama.

To avoid visible seams, the panorama is pre-sliced at build time into 8 tiles[^6], and each tile is loaded as a separate TinyGL texture at startup. The cylinder uses clamped wrapping at the top and bottom edges to prevent smearing.

![](/vault-assets/Pasted%20image%2020260524133944.png)

This is a good example of working *with* constraints rather than against them. Rather than trying to hack infinite-distance geometry into TinyGL, the fake just needs to be big enough that no die ever leaves its interior.

[^6]: Each is resized to 256×256, which is the original TinyGL's only texture size. The fork I use seems to have made it [configurable](https://github.com/jserv/tinygl/blob/c2e48591a6bfba1a85f1b87a78dcf1abf7dff57a/include/zfeatures.h#L57), but I have not tried.

# Things we can't do

So far, we've been talking about effects that we *managed* to squeeze into this little handheld, one way or another. Unfortunately, there are things that simply can't fit into the package.
## Refraction

Real glass **bends light** passing through it. A proper refraction effect would require either rendering the scene twice from different angles, or a screen-space trick where each pixel samples the framebuffer at an offset proportional to the surface normal. Both require reading from the framebuffer at arbitrary positions — something that is expensive on a CPU rendering into a fixed buffer, and that TinyGL's OpenGL 1.1 interface does not support. Refraction stayed on the cutting room floor[^5].

Refraction is expensive and hard to get right. Even in the THREE.js-based implementation, if you look closely into the banner image of [my repo](https://github.com/tslmy/threejs-dice), you'll see that refractions are not compounded: Looking through both the D6 and the D4 in front of it appeared as if you are just looking through the D4 itself. It's a major giveaway in this otherwise photorealistic render.

![](/vault-assets/20260524145833%20banner%20image%20of%20threejs-dice%20repo.png)
_The banner image of [my fork of `threejs-dice`](https://github.com/tslmy/threejs-dice)_

## Material capture (matcap)

Initially, I wanted to employ a *matcap*. It's a technique that fakes environment reflections using a lookup texture photographed from a sphere. When rendering, you compute the surface normal in camera space, use it as a 2D UV coordinate, and sample the texture. The result would look very convincing and cost almost nothing at runtime.

The problem: I wanted the camera to be rotatable. A matcap is essentially a photograph taken from one viewpoint; it only looks correct from that exact angle. As soon as the camera moves, the "reflections" don't follow the environment — the surface looks painted-on. The Fresnel + specular approach is slower but correct for any camera angle.

## Anything that involves blurring

Real shadows rarely have defined boundaries. Reflections on wood plates shouldn't look as sharp. Highlights would also have a dream-like glow, known as [the bloom](<https://en.wikipedia.org/wiki/Bloom_(shader_effect)>). All three effects would need some blurring computation to simulate, which is really tough on a CPU.

To blur a pixel, we need to know *what its neighbors look like*. Meanwhile, TinyGL's `glPostProcess` callback delivers one pixel at a time with no API for reading neighbors. Implementing a blur ourselves would require a **second framebuffer** allocation and bypassing the callback entirely. But a separate framebuffer is exactly the bottleneck we eliminated by replacing `rlsw` with TinyGL in [my previous post](https://blog.myli.page/porting-raylib-to-a-60-gba-clone-6a22c268ff15). My coding agent [estimated](https://gist.github.com/tslmy/08c31b28dbd5461e077f750d03b14322) a 15~50x demand in compute, depending on the quality we want. I would rather forego blurring in favor of a usable frame rate.

# Going faster: Optimizations

At 30 FPS on a 1.5 GHz dual-core Cortex-A7, every cycle counts.
## SIMD vertex transforms

Every frame, each die's vertices must be transformed from local coordinates to world coordinates using a 4×4 matrix. Instead of processing one vertex at a time, the code processes four simultaneously. This was possible because the CPU has an extension for "**single instruction, multiple data**" (SIMD) operations, named [ARM NEON](https://developer.arm.com/Architectures/Neon). By providing flags like `-mfpu=neon-vfpv4` in [our build script](https://github.com/tslmy/raylib-on-miyoo-mini-flip/blob/dfe6adedb7911b1b3e138c72ab43baa9db9923eb/docker/build.sh#L53), we are already telling GCC to optimize floating-point computations with it.

Beyond that, we can use the [NEON intrinsics](https://developer.arm.com/architectures/instruction-sets/intrinsics/) to hand-roll our own optimizations. To do that, we organize the data in a Structure-of-Arrays (SoA) layout by separating contiguous arrays for x, y, and z. With this arrangement, a single `vld1q_f32` instruction loads four consecutive x-values at once:

```cpp
struct alignas(16) V3Batch {
    float x[MAX_DIE_VERTS];
    float y[MAX_DIE_VERTS];
    float z[MAX_DIE_VERTS];
    int n;
};
```

The same SoA layout powers the scratch overlay rasterizer, which bypasses TinyGL entirely. OpenGL 1.1 has no fragment shaders, so TinyGL's per-face lighting is uniform across a face, and you can't vary a value per pixel. The fine scratches on a glass surface need *per-pixel* bump lighting that responds to the die's current rotation. The solution was [a custom scanline rasterizer](https://github.com/tslmy/raylib-on-miyoo-mini-flip/blob/b3600e5c55d99c1ac602dff02ea730f882024701/src/neon_overlay.cpp#L229) that walks the framebuffer pixel-by-pixel, samples a normal map, and computes the tangent-space dot product on the fly using NEON at four pixels per cycle.

## Build-time asset baking

A separate ["prebake" tool](https://github.com/tslmy/raylib-on-miyoo-mini-flip/blob/b3600e5c55d99c1ac602dff02ea730f882024701/tools/prebake.c) runs on the x86 build host inside Docker before any ARM code runs. It pre-computes:

1. The SH lighting coefficients (emitted as `prebaked_sh.inc`, a C header included at compile time)
2. The floor texture (lit and specularly highlighted per pixel, once, at build time)
3. The eight skybox tiles (pre-resized to 256×256)

This turns boot time from "several seconds of computation" into "load some PNG files".

## The number atlas: 21 glyphs in one texture

To show numbers on die faces, the renderer draws a small textured quad floating 0.005 units above each face surface. Switching textures per draw call is expensive, so all 21 glyphs (0–20) are packed into a single 256×256 **texture atlas** at startup. (You might have heard of a special case of this technique: sprite sheet.) When face "17" needs its decal, the code computes the atlas UV:

```cpp
int col = value % 4, row = value / 4;
*u0 = (float)(col * 64) / 256.0f;  // left edge
*u1 = (float)((col+1) * 64) / 256.0f;  // right edge
```

Multi-digit numbers get special treatment: each character is placed at a fixed spacing based on the widest digit ("8"), so "12" doesn't look cramped. Each glyph is drawn three times with 1-pixel offsets to fake a bold/shadow effect, since Raylib's built-in font produces thin strokes.

# The result

The final binary runs at 20 FPS on the MMF with up to 12 dice simultaneously: d4, d6, d8, d10, d12, and d20 in any combination. It includes reflections, shadows, a glass shading model, number decals, surface scratches, a skybox, and a live-tunable settings panel with 18 parameters (IOR, rim strength, specular, clearcoat, shadow softness, and more).

The codebase, [tslmy/raylib-on-miyoo-mini-flip](https://github.com/tslmy/raylib-on-miyoo-mini-flip), is ~2,500 lines of C++ spread across eight source files. The binary is about 6 MB. Boot time on device is under five seconds. The full build — including Docker, cross-compilation, and asset prebaking — runs in roughly three minutes on a modern laptop.

This dice roller was vibe-coded, though I try to understand at least what each component does. There are many interesting parts I have to leave out, such as procedurally-generated norm maps for bumps and scratches. It was really impressive that AI agents could pull those off, but they simply didn't fit the theme of "squeeze as much graphics as possible from a $60 handheld", so I had to leave them out from this long article.

I hope you enjoyed learning the art of computer graphics with me. Building a practical utility program for an limited platform gave me great sense of achievement, and I wish you would find it inspiring for your own side projects. Until next time!


[^1]: The GJK (Gilbert–Johnson–Keerthi) algorithm computes the distance between two convex shapes in amortized constant time for typical inputs, making it the fastest collision detection Bullet offers.

[^2]: Controlled by the `RAYLIB_MMF_RIG` environment variable in launch.sh. The B button cycles through rigged values.

[^3]: SH are a set of mathematical functions defined on a sphere — analogous to Fourier basis functions in 1D. "L2" means we keep terms up to degree 2, giving 9 basis functions. Each captures a different spatial frequency of the lighting environment: L0 is constant (average brightness), L1 varies linearly across the sphere (which direction is brightest), and L2 captures the next level of variation. The full derivation is in [Ramamoorthi & Hanrahan 2001](https://cseweb.ucsd.edu/~ravir/6998/papers/envmap.pdf).

[^4]: Christophe Schlick, "An Inexpensive BRDF Model for Physically-based Rendering", *Eurographics* 1994.

[^5]: Screen-space refraction is feasible in some OpenGL contexts using `glCopyTexSubImage2D` to sample the scene behind the surface — but at ~1 ms per texture copy at 750×560, doing it per-die per-frame on a CPU renderer was not going to happen.

[^7]: Required since we use [Gouraud shading](https://en.wikipedia.org/wiki/Gouraud_shading) to avoid per-pixel work. Otherwise, the faces would appear to have their opacities on linear gradients from corner to corner.
