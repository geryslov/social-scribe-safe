# Thought Leadership Post: "Classification is the comment"

Author: Gery Slov
Date: 2026-08-17
Platform: LinkedIn (organic)
Status: Ready to publish

---

## 1. Writer profile

Built from public sources (see Sources at the bottom). Used to set voice, altitude, and what this person is credible saying.

**Who he is**
Founder of Pipelight.io, based in Tel Aviv-Yafo. Describes the work as building B2B growth engines that scale companies from seed to $1.5B exits.

**Career trajectory**
WalkMe (NASDAQ: WKME), DealHub.io, SentinelOne, Sprinklr, then GerySlov.com and Pipelight.io. B.Sc. in Management Information Systems, Max Stern Yezreel Valley College.

That path matters for voice: he is an in-house B2B SaaS operator who went agency-side, not a marketer who has only ever sold marketing. He has sat on the buyer side of the exact budget he now spends.

**What he posts about**
LinkedIn advertising mechanics, B2B marketing, campaign optimization, tooling. Tactical and feature-level, not motivational. Recurring hashtags: #linkedinads, #linkedinadvertising, #b2bmarketing, #linkedinmarketing. Sample post titles show a working-practitioner register ("Competitive analysis via LGFs").

**Voice markers to hold**
- Operator, not commentator. Talks about what was built and what it cost.
- Mechanics over inspiration. Names the setting, the cap, the token limit.
- Comfortable with jargon, allergic to buzzwords.
- Short declarative sentences. Little hedging.

**Voice markers to avoid**
- Agency-pitch language ("we help brands unlock...").
- Motivational framing.
- Anything that sounds like a marketer describing AI from the outside. He ships the thing.

---

## 2. Company analysis: Pipelight.io

**Positioning (site copy)**
"Pipelight is the B2B growth engine built by operators who scaled to $1.5B exits, now with a proprietary LinkedIn Ads MCP. Measured on revenue."

Site title: "Pipelight - B2B Pipeline Agency · LinkedIn Ads MCP"

**USP, decomposed**
1. Operator credibility as the entry claim. Not "award-winning agency," but people who scaled real companies to real exits.
2. Proprietary tooling as the moat. The LinkedIn Ads MCP is the differentiator against agencies renting the same ad manager everyone else uses.
3. Revenue as the accountability line. "Measured on revenue" is a direct shot at agencies that report leads and impressions.

**Motivators, decomposed**
- Buyers are tired of lead volume that never becomes pipeline.
- Buyers suspect agencies are doing manual work and billing it as strategy.
- Buyers can tell the difference between someone who has run the budget and someone who has only sold against it.

**Content implication**
The strongest post for this positioning is not a case study. It is showing the machinery. An agency that says "proprietary tooling" and then shows a token cap, a cache write, and a 27-item banned phrase list proves the claim in a way a testimonial cannot.

---

## 3. Platform analysis: what ThoughtOS actually does

The post is about the engagement commenting pipeline. Every number below is read from this repository, not estimated.

### The system, end to end

**Ingest.** `sync-all-engagement-targets` runs daily. Targets are grouped by workspace and chunked at 40 profiles per Apify run (`BATCH_SIZE = 40`), with a 20-hour cooldown per target (`COOLDOWN_HOURS = 20`) so a target stays eligible on the next daily pass. A 110-second time budget guards the edge function timeout; when hit, the function re-invokes itself with `trigger: cron_continue` and picks up where it stopped. Posts come in via `fetch-target-posts-batch`, outbound comment activity via `fetch-target-comments-batch`.

**Voice.** `generate-voice-profile` scrapes the publisher's LinkedIn (Firecrawl, falling back to Apify, falling back to database-only) and writes a 350 to 600 word profile in six fixed sections: Professional Identity, Writing Voice, Content Themes, Vocabulary & Phrasing, Perspective & Worldview, Positions & Beliefs. The last section is the load-bearing one: 6 to 10 concrete `[topic]: [take]` lines. The prompt explicitly bans generic influencer phrases from ever entering a voice profile, and instructs the model to skip a position rather than invent one.

**Classify.** `classify-post` runs when the comment composer mounts, not when the user clicks generate. Model: `claude-sonnet-4-5-20250929`. `max_tokens: 200`. It returns `{ post_type, subject, notable_angle }` and writes the result into `engagement_posts.post_metadata.classification` with a `classified_at` stamp, so every later open of that post reads from the database instead of re-hitting the API.

Eleven known types: announcement_funding, announcement_launch, announcement_hire, announcement_milestone, opinion_hot_take, opinion_lesson, data_insight, story_personal, educational, question, promotion. If none fit, the model writes a new label rather than forcing a match.

**Generate.** `generate-comment` runs on click. `max_tokens: 500`. Four prompt-side phases in a single call:

1. Classify (skipped when a cached classification is passed in)
2. Find the notable angle, then derive a `comment_strategy` from it (also skipped when cached)
3. Draft, using the strategy for what to say and the voice profile for how to say it
4. Critique the draft against a six-item checklist, revise once, return only the revision

The critique checklist: does it restate the post, does it sound like a neutral assistant, does it open with the first name when the post is not a milestone or hire or launch or personal story, is it over 15 words without being a genuine hot-take response, does it use hedged praise adjectives without a load-bearing follow-up, does it echo one of the publisher's actual positions when a relevant one exists.

**Constraints in the prompt.** 27 banned phrases listed by name. No em dashes. Default target of 6 to 15 words, one sentence, two only when the post is a hot take or analytical lesson that earns it.

**Act.** `post-linkedin-comment` posts through the LinkedIn Community Management API. `auto-like-target-posts` likes at most one post and one comment per target per day, with 6 to 12 second jitter between actions, under a hard 30 auto-likes per publisher per day cap in `like-linkedin-post` (`AUTO_LIKE_DAILY_CAP = 30`). Manual likes bypass the cap because a human button press is not automation.

### Scale of the codebase
31 edge functions, 59 migrations, roughly 9,800 lines of edge function code. `create-document` carries the largest prompt at 898 lines total.

### The one architectural idea worth a post

Phase 2 is the differentiator, and it is the part nobody else builds.

Classification alone gets you to a bucket. Buckets produce bucket-shaped comments: every funding post gets a comment about size and stage, every launch post gets a comment about timing. The prompt calls this out directly and demands the notable angle instead, with worked examples of the difference.

That is a genuine insight about applied LLM design, not a product feature. It is why the post works as thought leadership rather than promotion.

---

## 4. The post

```
Every AI commenting tool does the same thing. Reads a post, writes a comment.

One step. That's the whole problem.

We rebuilt ours as four phases across two model calls.

Phase 1 labels the post. Eleven types: funding, launch, hire, milestone, hot take, lesson, data insight, personal story, educational, question, promotion. If nothing fits, it writes a new label. Capped at 200 tokens and cached to the database, so it never runs twice on the same post.

Phase 2 is the one nobody builds. It names the single most notable thing about this specific post. Not "it's a funding announcement." Closer to "Series B led by a crypto-native fund for a compliance product."

Skip that phase and every funding comment collapses into the same sentence about size and stage.

Phase 3 drafts, using the publisher's voice profile: 6 to 10 written positions they actually hold, so the comment carries an opinion instead of neutral agreement.

Phase 4 critiques that draft against six questions and revises once. Does it restate the post? Does it open with the author's first name out of habit? Is it past 15 words without earning them? Only the revision ships.

27 phrases are banned by name. Game changer. Spot on. Couldn't agree more. Em dashes too.

Target output: one sentence, 6 to 15 words.

Here's why this matters. Generic AI comments are not a model quality problem. They're a missing step problem. The model was never told what it was looking at, so it wrote the average of everything it has ever read.

Two calls cost more than one. Reasonable people will call that overhead on a 12-word comment.

It isn't overhead. Classification is the comment.

How we build the rest of the engine: https://www.pipelight.io/?utm_source=linkedin&utm_medium=organic&utm_campaign=thought-leadership&utm_content=classification-is-the-comment

#B2BMarketing #LinkedInStrategy #AIAgents
```

Word count: 280 (excluding URL and hashtags). Inside the 260 to 300 target.

---

## 5. Reasoning

**Hook pattern:** The Contrarian Position. "Everyone does X. That's the problem." Chosen over a data hook because there is no performance data to lead with, and a fabricated number would break the data integrity rule.

**Narrative arc:** Arc 4, Framework / Method. Promise a systematic approach, show why the current method fails, break down the steps, close on how to think about it.

**Persona:** Directors and founders in B2B SaaS marketing who are evaluating or already running AI engagement tooling. They have seen the generic AI comment. They have probably shipped one. The post names their exact failure mode and explains the mechanism.

**Content pillar:** Educational, with a contrarian frame. Roughly 60 percent educational, 40 percent contrarian.

**So what.** Stated explicitly in the second-to-last block: the failure is not model quality, it is a missing step. That reframe is portable. It applies to any LLM feature that jumped straight from input to output without an intermediate representation. A reader who builds nothing on LinkedIn still leaves with something they can use on Monday.

**Where it leaves room to challenge or complement.** Two openings, both deliberate:

1. "Two calls cost more than one. Reasonable people will call that overhead on a 12-word comment." This concedes the strongest counterargument by name instead of pretending it doesn't exist. It invites the cost-per-comment reply, which is a good comment thread rather than a defensive one.
2. The 6 to 15 word target is a stated opinion, not a fact. Anyone who believes longer comments perform better now has a specific number to argue against, which is more productive than arguing against a vibe.

Both are engagement engines. Comments outrank likes in the algorithm, and a named counterargument gets replies that generic agreement never does.

**Why the close works.** "Classification is the comment" is a reframe, not a summary, and it ends on a statement rather than a question. It also lands the differentiated claim in five words, which is the shape most likely to get quoted back in the comments.

**Formatting decisions.**
- No arrow bullets and no double hyphens, per the direct instruction in the brief. This overrides the arrow formatting rule in the base template, and it happens to match this platform's own prompt rules, which ban em dashes outright.
- No bold text.
- Every paragraph is one to three sentences.
- Sentence rhythm alternates long and short, with three deliberate one-line pattern interrupts ("One step. That's the whole problem.", "Target output: one sentence, 6 to 15 words.", "It isn't overhead. Classification is the comment.")
- Hashtags at the end, three of them.
- URL after the value, with full UTM parameters.

---

## 6. Data integrity notes

**Every number in the post is read from this repository:**

| Claim in post | Source |
|---|---|
| Eleven known post types | `supabase/functions/classify-post/index.ts`, `generate-comment/index.ts` |
| 200 token cap on classification | `classify-post/index.ts:77` |
| Cached to the database | `classify-post/index.ts:117-139`, writes `post_metadata.classification` |
| Four phases, two model calls | `generate-comment/index.ts` system prompt, phases 1 to 4; `classify-post` is the separate second call |
| 6 to 10 written positions | `generate-voice-profile/index.ts:221-227` |
| Six-item critique checklist | `generate-comment/index.ts`, Phase 4 |
| 27 banned phrases | `generate-comment/index.ts:93`, counted |
| 15 word ceiling / 6 to 15 word target | `generate-comment/index.ts`, absolute rule 6 |
| No em dashes | `generate-comment/index.ts`, absolute rule 1 |

**What is deliberately absent, and why.**

There are no performance metrics in this post. No reply rate, no acceptance rate, no reduction in editing time, no pipeline attribution. That is not a stylistic choice. This repository contains the system, not the results, and inventing a number to strengthen a claim is the one rule the brief marks absolute.

**To upgrade this post into a data-driven one, the following would need to be pulled from production:**
- Percentage of AI-suggested comments posted without edits, before and after the Phase 2 notable-angle step shipped
- Median reply and reaction counts on posted comments, from `engagement_comments.reaction_count` and `reply_count`
- Cost per comment across the two calls, to answer the overhead objection with a real figure instead of conceding it
- Number of comments posted across the workspace over a defined window

With any two of those, the hook can be rebuilt on Pattern 1 (The Data Contradiction) or Pattern 8 (The Specificity Hook), which will outperform a contrarian opinion hook.

---

## 7. QA checklist

Content quality
- [x] Hook works standalone in the first three lines
- [x] Insight is specific, not generic
- [x] Every claim traced to a source file
- [x] No vague quantifiers
- [x] Contrarian angle present and defended
- [x] Clear takeaway in the closing lines

Data integrity
- [x] All numbers traced to source
- [x] No fabricated quotes, testimonials, or performance metrics
- [x] Gaps declared in section 6 rather than filled

Formatting
- [x] Micro-paragraphs, one to three sentences
- [x] No arrow bullets, no double hyphens, no em dashes
- [x] No bold text
- [x] Varied sentence rhythm
- [x] Mobile-friendly white space

Platform
- [x] 280 words, inside the 260 to 300 range
- [x] URL with full UTM parameters, placed after the value
- [x] Three hashtags at the end
- [x] Ends on a statement, not a question

Strategic
- [x] Arc 4, Framework / Method
- [x] Hook Pattern 5, Contrarian Position
- [x] Targets B2B SaaS marketing directors and founders
- [x] Educational pillar with contrarian frame
- [x] Proves the "proprietary tooling" positioning claim by showing the tooling

**Posting window:** Tuesday to Thursday, 8 to 10am or 12 to 2pm local. Plan to respond to comments within the first two hours; the conceded cost objection is the thread most likely to open, and answering it with a real cost-per-comment figure is the strongest follow-up available.

---

## Sources

- [Gery Slov on LinkedIn](https://www.linkedin.com/in/geryslov/)
- [Gery Slov, LinkedIn author page](https://www.linkedin.com/today/author/geryslov)
- [Pipelight - B2B Pipeline Agency · LinkedIn Ads MCP](https://www.pipelight.io/)
- [Gery Slov contact and role listing, RocketReach](https://rocketreach.co/gery-slov-email_76643465)
- [Gery Slov, "Competitive analysis via LGFs"](https://www.linkedin.com/posts/geryslov_competitive-analysis-via-lgfs-activity-7084441843299491840-RTFb)
- Platform detail: this repository, `supabase/functions/` and `supabase/migrations/`
