---
layout: homepage
---

<p class="section-label">About</p>

<div class="about-row">
  <div class="profile-sidebar">
    {% if site.avatar %}<div class="profile-avatar"><img src="{{ site.avatar }}" alt="Portrait of {{ site.title }}" /></div>{% endif %}
    <div class="profile-contact" aria-label="Contact links">
      <a href="{{ site.github_link }}" target="_blank" rel="noopener">GitHub</a>
      <a href="mailto:{{ site.email }}">gmail</a>
    </div>
  </div>
  <div class="about-intro">
    <p>Hi! I am <strong>{{ site.title }}</strong>, a research student at <a href="{{ site.affiliation_link }}">{{ site.affiliation }}</a>, working on <span class="keyword">embodied intelligence</span> and <span class="keyword">robotic learning</span>.</p>
    <p>Feel free to reach out if you are interested in collaboration or potential opportunities.</p>
  </div>
</div>

## News

<div class="news-box">
  <ul class="news-list">
    {% for item in site.data.news %}
    <li><span class="news-date"><em>{{ item.date }}</em></span><span class="news-brand"><img src="{{ item.logo | relative_url }}" alt="{{ item.logo_name }}" width="72" height="28" loading="lazy" decoding="async"></span><span class="news-text">{{ item.text }}</span></li>
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
