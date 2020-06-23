# How Well Do You Know Your World

```
THUMBNAIL IMAGE
```

The world is your game board! Run around a beautifully rendered planet Earth. Aim at countries you're challenged to identify. Do it all before the clock runs out to prove how well you know your world!

Try it out: [LINK]()

Video DEMO: [LINK OR EMBED]()

Technologies: [Spark AR Studio](https://sparkar.facebook.com/ar-studio/), [d3.js](https://d3js.org/)

```
IMAGE GALLERY
```

## Inspiration

I'm inspired by games that teach through gameplay. There are some fun, simple geography games out there. I like to challenge myself with them from time to time. It's so easy to forget where a country is when you aren't exposed to it's name very often. And when you forget where a country is, you lose so much context since the bordering countries are culturally related. Geography is a foundational knowledge that helps build a better understanding of our diverse world.

## What it does

In this game you're given a timed challenge to find countries in the world. A realistic planet Earth hovers above the floor in front of you. As you move around it, aiming your camera at its surface, countries light up below your cursor.

```
...
```

## How I built it

The Earth is rendered with real NASA data, a day and night side, reflective oceans, drifting clouds, and an atmosphere.

I started off by watching the [tutorial by Blender Guru](https://www.youtube.com/watch?v=9Q8PwcDzb8Y) on making a realistic planet Earth in Blender. It used a different technology, but there were principles I could use when building my Earth in Spark AR.

For Earth's texture, I used imagery from NASA's [Visible Earth](https://visibleearth.nasa.gov/) and [Science Visualization Studio](https://svs.gsfc.nasa.gov/index.html) projects. They provide high resolution images of the Earth in the correct projection, equirectangular. I downloaded images for [daytime](https://visibleearth.nasa.gov/collection/1484/blue-marble), [nighttime](https://visibleearth.nasa.gov/collection/1595/earth-at-night), [clouds](https://visibleearth.nasa.gov/images/57747/blue-marble-clouds), [topography](https://visibleearth.nasa.gov/images/73934/topography), and a black and white [land/sea mask](https://svs.gsfc.nasa.gov/3487).

I used my favorite commandline image swiss-army-knife, [ImageMagick](https://imagemagick.org/index.php), to preprocess these images, altering their size and color channels as needed. I also converted NASA's height map into a normal map using the open source tool [NormalMap-Online](https://cpetry.github.io/NormalMap-Online/).

I used D3 and topojson to detect which country was selected...

```
...
```

## Challenges I ran into

### Country Selection Highlighting

I wanted to challenge the player to find countries without all their borders being visible. Instead I wanted to show the player just one country at a time as they scrubbed their cursor over the surface of the globe. I didn't have 3D geometry for all of the borders of the countries, and those I found online had too many polygons. I decided to try using a texture. I used D3 to generate a texture in which every country had a unique color. I then figured out a clever trick to mask out all but a single country from this map. Let's say I wanted to highlight just the country colored red, (1,0,0). I put the entire map through a shader that finds each fragment color's distance from red. All countries will have a non-zero distance except the red one. Now if I subtract that value from 1, all country's values are less than one, other than the red one. Finally, I can raise that value to a high exponent and all the other country's values will drop near zero, except the red one. From there I just alter and have my highlight.

### Pausing a Signal

As a player is highlighting countries, searching for the correct one, the camera orientation signal is ultimately driving the position of the cursor and the country that is highlighted. When the player hits the right country, I wanted to pause the selection of that country to allow time for the correct answer to register. This was challenging because I knew of no way to pause a signal. Luckily, I came up with a solution using the "Offset" patch. Since this patch measures the difference between the current signal and the signal's value the last time the patch was reset, I was able to use this difference to calculate the signal from the past. I suspect I could have used signal histories or signal recorders to achieve the same effect.

## Accomplishments that I'm proud of

I'm really happy with how the Earth came out. It has about as much detail, animation, and realism as I could pack into an AR application. In particular, I'm proud of solving the problems of lighting and atmosphere.

To light the Earth realistically, I used NASA's separate day and night textures. I supply the position of the "Sun" directional light in the scene as input to the Earth's surface shader. I then use it to transition from day to night in a realistic way.

Another feature that worked well was the atmosphere. I created a Fresnel shader out of patches and use it to create a blue haze that hugs the edges of the earth and thickens as you look through the atmosphere at a lower angle.

```
record gif of spinning the sun?
```

## What I learned

Through completing this project I learned more about:

- Advanced 3D rendering techniques in Spark AR
- Algorithms and patterns in Patches and Reactive programming
- Organization and re-use with Groups and Patch Assets
- Bridging Patches and Scripts
- Incorporating 3rd party libraries like d3.js
- Animating UVs and 2D UI elements
- Effective debugging in Spark AR

## What's next?

I'm not sure what I'll tackle next, but there's room for:

- [ ] The ability to record and share a video of your victory!
- [ ] Translation into other languages
- [ ] Difficulty adjustments, especially a better strategy for aiming at small countries.
- [ ] Data cleanup. There are some issues with the country data I'd like to fix.
- [ ] Having people start off pointing at the country where they live.
- [ ] Design upgrades, organization, applying more of what I learned along the way.

## Licenses

### [d3](https://github.com/d3/d3)

Copyright 2010-2017 Mike Bostock
All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

- Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

- Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

- Neither the name of the author nor the names of contributors may be used to
  endorse or promote products derived from this software without specific prior
  written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

### [world-atlas](https://github.com/topojson/world-atlas)

Copyright 2013-2019 Michael Bostock

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
