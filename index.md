---
layout: homepage
---

<h1 class="main-heading">Hi there <span aria-hidden="true">&#128075;</span> Welcome to my Homepage!</h1>

Hi! I am **Yifan**, a research student at [South China University of Technology](https://www.scut.edu.cn/en/), working on embodied intelligence and robotic learning.

Feel free to reach out if you are interested in collaboration or potential opportunities.

## News

<div class="news-box">
  <ul class="news-list">
    {% for item in site.data.news %}
    <li><span class="news-date"><em>{{ item.date }}</em></span> {{ item.text }}</li>
    {% endfor %}
  </ul>
</div>

## Experience

{% include experience.html %}

## Research Interests

<ul>
  {% for item in site.data.interests %}
  <li><strong>{{ item.topic }}:</strong> {{ item.detail }}</li>
  {% endfor %}
</ul>

<!-- Add selected publications and projects here when they are ready. -->
