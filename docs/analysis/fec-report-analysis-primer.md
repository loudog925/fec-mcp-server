# How to Analyze an FEC Report: A Journalistic Primer

**Author:** Louis Levine. Added to the repo 2026-08-31 as the canonical analytical
framework this server's analysis tooling is meant to implement.

Section numbers in this document are stable and are referenced by
`implementing-the-primer.md` and by test names. Please don't renumber sections
without updating those references.

---

An FEC report is an accounting document. It tells you what a political committee says it received, spent, owes and has in the bank.

The journalistic task is different: **What does the money tell us about the campaign?**

A useful analysis should answer questions like:

* Is this campaign financially strong or struggling?
* Who is funding it?
* Is its fundraising broad or concentrated?
* Is the candidate putting in their own money?
* What is the campaign spending money on?
* Is it building an organization, buying advertising, raising more money or simply burning cash?
* Who are the consultants and vendors benefiting?
* Is the campaign accumulating debt?
* What changed since the last report?
* What activity is happening outside the campaign that won't appear on this report?
* Is there anything unusual enough to investigate further?

The goal isn't to find technical violations. It is to reconstruct the campaign's financial and political strategy.

---

# 1. First: Know What You're Looking At

Before examining a single dollar, identify four things.

### Who filed the report?

Search the committee, not merely the candidate's name.

A candidate can have a principal campaign committee, additional authorized committees, a leadership PAC, and participation in one or more joint fundraising committees. Those are different entities with different financial activity.

The FEC itself warns that candidate-level totals can even double-count money when multiple authorized committees transfer funds among themselves.

### What kind of committee is it?

This fundamentally changes how the filing should be interpreted.

| Committee                   | Typical filing | What you're analyzing                                            |
| --------------------------- | -------------- | ---------------------------------------------------------------- |
| House/Senate campaign       | Form 3         | Candidate fundraising and spending                               |
| Presidential campaign       | Form 3P        | Presidential campaign finances                                   |
| Traditional PAC             | Form 3X        | Contributions, operating activity, candidate support             |
| Super PAC                   | Form 3X        | Unlimited fundraising and independent political spending         |
| Party committee             | Form 3X        | Party fundraising, transfers, direct spending and other activity |
| Joint fundraising committee | Form 3 or 3X   | Money collected and distributed among participating committees   |

Super PACs may accept unlimited contributions from individuals, corporations, labor organizations and other PACs for independent political activity. Hybrid PACs combine an unlimited-money account with a separate account subject to contribution restrictions. Leadership PACs are controlled by candidates or officeholders but are legally separate from their campaign committees.

### What period does the report cover?

Never compare two campaigns until you're sure you're comparing the same period.

Reports can be monthly, quarterly, pre-election, post-election or year-end. A pre-general report, for example, generally closes its books **20 days before Election Day**, so it is not a snapshot of the campaign's finances on Election Day.

### Is it the latest amendment?

This is critical.

Committees amend reports when they discover errors or obtain information that wasn't available when the original report was filed. Electronic filers generally resubmit the entire report when amending it.

If you're downloading raw filings or transaction data, don't simply sum every version you find. Some FEC datasets contain transactions from both original and amended filings, which can inflate totals if amendments aren't handled properly. The FEC specifically warns about this in its independent-expenditure data.

---

# 2. The Four Numbers to Read First

For a candidate committee, start with the summary page.

Ignore the hundreds or thousands of transactions initially.

Find:

**Receipts
Disbursements
Cash on hand
Debts owed**

Those four figures give you the campaign's basic financial position.

For congressional campaigns, the Form 3 summary includes period activity and election-cycle totals. Column A is generally **this reporting period** and Column B is **election-cycle-to-date**.

## Cash on hand

This is usually the single most politically important number.

Fundraising measures what has happened.

Cash on hand measures **capacity to do something next**.

For a campaign approaching an election, $3 million raised and $2.8 million spent tells a much different story from $3 million raised and $1 million spent.

But cash alone can mislead.

A campaign with:

> $2.0 million cash
> $1.3 million outstanding debt

is in a very different position from a campaign with $2 million cash and no debt.

A useful analytical figure is therefore:

**Effective cash position = Cash on hand − debts owed by the committee**

It isn't an official FEC metric, but it can be useful journalistically.

---

# 3. Don't Treat "Total Receipts" as "Money Raised"

This is one of the easiest mistakes to make.

Total receipts can include things other than actual fundraising:

* individual contributions
* PAC contributions
* candidate contributions
* candidate loans
* other loans
* transfers between committees
* refunds or offsets received
* other receipts

For this reason, the FEC itself uses an **adjusted receipts** methodology when displaying "money raised," removing categories that can distort fundraising comparisons.

So when someone reports:

> Candidate X raised $8 million.

Ask:

**What exactly is included in that $8 million?**

If $3 million came from the candidate personally as a loan, the journalistic story isn't simply that the campaign "raised $8 million."

It's:

> The campaign brought in $8 million, including a $3 million loan from the candidate.

That is a very different political fact.

---

# 4. Read the Receipts Side as a Fundraising Profile

For a House or Senate campaign, Schedule A contains itemized receipts.

The major questions are:

### How much came from individuals?

This is usually the core fundraising measure for a campaign.

Then break individual money down further.

### How much is itemized versus unitemized?

Individual contributions generally must be itemized once the contributor's aggregate contributions exceed $200 during the election cycle. Contributions that have not crossed that threshold can be reported as a lump sum without contributor information.

This gives you a useful metric:

**Unitemized share = Unitemized individual contributions ÷ total individual contributions**

But describe it carefully.

It is often used as a proxy for "small-dollar fundraising," but it is **not the same thing as the percentage of donors who are small-dollar donors**.

You don't know the identity of contributors contained in the unitemized total, and itemization rules are based on cumulative giving.

So:

> "42% of the campaign's individual contributions were unitemized"

is defensible.

> "42% of its donors gave less than $200"

is not.

### Who are the largest donors?

For individual contributions, useful analyses include:

* top contributors
* repeat contributors
* geographic concentration
* employers
* occupations
* concentrations within industries or professional networks

Do not treat employer and occupation fields as perfectly clean data. They are reported information and require normalization before doing serious aggregation.

### How dependent is the campaign on PACs?

Compare:

**PAC contributions ÷ total contributions**

A large PAC share can tell you something about the candidate's institutional support even when it doesn't necessarily tell you whether their campaign is financially weak or strong.

### Is the candidate self-funding?

Look separately at:

* contributions from the candidate
* loans from the candidate

Candidate loans are especially important because they remain liabilities of the campaign until repaid or otherwise resolved and are continuously disclosed on Schedule C.

Large candidate financing can radically change the interpretation of a fundraising number.

---

# 5. Joint Fundraising Committees Require Special Care

Modern campaigns frequently raise money through joint fundraising committees, or JFCs.

This creates one of the biggest traps in FEC analysis.

Suppose a donor gives $10,000 to a joint fundraising committee.

The JFC might distribute pieces of that contribution among:

* a candidate campaign
* a national party
* a state party
* another participating committee

The candidate campaign reports the **net transfer** it receives from the JFC. It also reports its share of the underlying donors as **memo entries**.

Those memo entries provide disclosure about who generated the money, but they aren't additional cash coming into the campaign.

The FEC explicitly notes that the transfer represents net proceeds after allocated fundraising costs, while supporting memo entries can show the campaign's gross share of the underlying contributions.

### Why this matters

If you add:

> JFC transfer + all underlying donor memo entries

you can double-count the fundraising.

For journalistic donor analysis, the underlying contributor entries are extremely useful.

For cash accounting, use the actual transfer.

This distinction becomes increasingly important when analyzing large national campaigns.

---

# 6. The Spending Side Is Where Strategy Becomes Visible

Schedule B contains itemized disbursements.

This is often the richest part of the report journalistically.

For candidate committees, operating expenditures exceeding the reporting threshold are itemized with:

* payee
* address
* amount
* date
* purpose of expenditure

Rather than simply ranking vendors, classify spending into functional categories.

For example:

| Category         | Examples                                              |
| ---------------- | ----------------------------------------------------- |
| Media            | TV, digital advertising, radio, streaming             |
| Direct mail      | printing, postage, mail consultants                   |
| Digital          | advertising, acquisition, creative, email/SMS vendors |
| Fundraising      | consultants, event costs, telemarketing               |
| Payroll          | salaries, payroll processors, benefits                |
| Field            | canvassing, organizing, voter contact                 |
| Polling/research | polling firms, analytics, research                    |
| Travel           | airfare, hotels, mileage                              |
| Compliance/legal | compliance firms, attorneys, accountants              |
| Technology/data  | voter data, software, CRM, texting                    |
| Overhead         | rent, insurance, office supplies                      |

Then ask:

**What kind of campaign are they building?**

A campaign pouring money into payroll and field six months out is behaving differently from one pouring money into donor acquisition.

A campaign suddenly spending millions with media firms is entering a different phase.

A campaign whose spending consists overwhelmingly of fundraising costs may be raising a lot of money without creating equivalent electoral capacity.

---

# 7. Don't Assume the Named Payee Is the Ultimate Vendor

This is another major trap.

You may see payments to:

* American Express
* a payroll processor
* a staff member
* a consulting firm

Those aren't always the ultimate beneficiaries of the spending.

For example, when campaigns pay credit-card bills, they may also disclose the underlying merchants as memo entries. The FEC requires disclosure of qualifying underlying transactions to the actual vendors.

So don't conclude:

> "The campaign spent $200,000 on American Express."

It paid $200,000 **through** American Express.

You need to inspect the underlying memo entries.

The same principle applies to reimbursements, payroll vendors and some consultants.

And even the ultimate FEC payee may still be an intermediary. A media-buying firm receiving $5 million may subsequently place the money with television stations and digital platforms.

The filing tells you who the campaign paid. It does not necessarily tell you where every dollar ultimately ended up.

---

# 8. Read Purpose Descriptions

The "purpose of disbursement" field is valuable.

It may tell you whether a payment was for:

* media placement
* digital advertising
* fundraising consulting
* polling
* printing
* travel
* legal services
* payroll
* event expenses

The FEC requires the purpose to be specific enough that an outsider can reasonably understand why the expenditure was made, although the quality of descriptions varies considerably.

Purpose descriptions are particularly useful when a vendor does several kinds of work.

Don't classify spending solely based on vendor name.

---

# 9. Measure the Campaign's Burn

One of the most useful period-to-period calculations is:

**Basic burn rate = period disbursements ÷ period receipts**

Example:

> Raised: $5.0 million
> Spent: $3.0 million
> Burn rate: 60%

That immediately tells you something about whether fundraising is translating into accumulated resources.

But this simple calculation can be distorted by:

* loans
* transfers
* refunds
* debt payments
* in-kind transactions
* unusual one-time activity

For serious analysis, I would calculate both:

**Headline burn:**
Total disbursements / total receipts

and

**Operating burn:**
Operating campaign spending / actual fundraising receipts

The second number often provides the better political picture.

Also calculate:

**Cash accumulation = ending cash − beginning cash**

A campaign that reports a huge fundraising quarter but barely increases its cash should prompt the question:

> Where did the money go?

---

# 10. Look at Debt

Debt is frequently under-covered.

Schedule D reports debts and obligations other than loans, while Schedule C deals with loans.

Debts can include unpaid vendor bills and contractual obligations. Certain debts must continue appearing in subsequent reports until extinguished.

Journalistically, rising debt can mean several things:

* the campaign is financially stressed
* vendors are extending credit
* expensive activity occurred late in the reporting period
* spending is running ahead of cash flow

It is not automatically evidence of financial distress.

For instance, campaigns may incur major advertising obligations before actually paying invoices.

So analyze:

**Debt this report vs. debt last report**

and ideally:

**Debt as a percentage of cash on hand**

A sudden debt spike deserves investigation.

---

# 11. Refunds Tell Their Own Story

Contribution refunds appear separately from ordinary operating spending. Congressional committees report refunds on Form 3 Line 20.

A high level of refunds can reflect:

* excess contributions
* contribution redesignations or reattributions
* donor requests
* processing issues
* compliance cleanup

Again, don't assume wrongdoing.

But a sudden spike in refunds is absolutely worth examining.

Calculate:

**Refund rate = contribution refunds ÷ contributions received**

Then compare it with prior periods and comparable campaigns.

---

# 12. In-Kind Contributions Can Distort Naive Spending Analysis

An in-kind contribution is a good or service provided instead of cash.

The important accounting quirk is that an in-kind contribution appears as **both a receipt and an expenditure** so that the campaign's cash-on-hand calculation is not artificially increased.

That means a campaign can technically show $100,000 of receipts and $100,000 of expenditures even though no $100,000 ever moved through its bank account.

When building a cash-flow or burn analysis, identify and exclude in-kind transactions where appropriate.

---

# 13. Examine the Timing, Not Just the Totals

Transaction dates often reveal more than aggregate numbers.

Graph receipts and spending by day or week.

Look for:

### Fundraising spikes

Possible explanations include:

* candidate announcement
* debate
* major endorsement
* controversy
* fundraising deadline
* national political event
* major digital fundraising campaign

### Spending spikes

These may signal:

* television reservations
* direct-mail drops
* polling
* hiring
* campaign launch
* field expansion

The interesting question isn't merely:

> How much did they spend?

It is:

> **When did they decide to spend it?**

That gets you closer to campaign strategy.

---

# 14. Compare Against the Previous Report

A filing becomes much more meaningful when treated as a **change report**.

Build a simple table:

| Metric                   | Previous period | Current period | Change |
| ------------------------ | --------------: | -------------: | -----: |
| Raised                   |                 |                |        |
| Individual contributions |                 |                |        |
| Unitemized individual    |                 |                |        |
| PAC contributions        |                 |                |        |
| Candidate money          |                 |                |        |
| Spending                 |                 |                |        |
| Cash on hand             |                 |                |        |
| Debt                     |                 |                |        |

Then ask:

**What changed fastest?**

That will frequently lead directly to the story.

Examples:

> Fundraising rose 25%, but spending doubled.

> Cash fell for the third consecutive quarter.

> The candidate injected $1 million after fundraising slowed.

> PAC contributions increased sharply after the candidate became the presumptive nominee.

> Advertising spending started six weeks earlier than last cycle.

Those observations are much more meaningful than the topline filing numbers alone.

---

# 15. Compare Against the Right Opponent

Campaign finance stories frequently make bad comparisons.

Candidate A:

> $6 million cash on hand.

Candidate B:

> $3 million cash on hand.

That sounds decisive until you discover Candidate A has already had its primary while Candidate B faces one in three weeks.

Compare:

* equivalent reporting periods
* candidates at equivalent points in the election calendar
* incumbent vs. incumbent where possible
* challenger vs. challenger
* competitive races with similar media markets

For historical benchmarking, the FEC publishes cycle-level statistics and tables specifically designed to compare financial activity across equivalent periods.

---

# 16. The Campaign Report Does Not Show the Entire Campaign

This may be the most important conceptual point in the guide.

Looking only at the candidate committee can dramatically understate the money affecting an election.

Also investigate:

### Independent expenditures

Super PACs, parties and other groups may spend money supporting or opposing the candidate without that money passing through the campaign.

Independent expenditures by registered political committees are generally reported on Schedule E. The filing identifies the candidate supported or opposed, vendor, amount and other information.

In addition, qualifying independent expenditures close to an election can trigger 24- or 48-hour reporting.

### Party activity

Party committees can contribute, transfer money and conduct various forms of spending benefiting candidates.

### Leadership PACs

An incumbent's leadership PAC can reveal relationships and political priorities that aren't visible in the candidate committee.

### Joint fundraising committees

These can reveal a candidate's relationship to party infrastructure and major donors.

So a proper candidate financial profile is closer to:

**Candidate committee

* associated committees
* joint fundraising
* outside spending supporting/opposing candidate
* relevant party activity**

The FEC's own candidate-research checklist recommends examining not only candidate filings but cross-referencing PAC contributions, party contributions and independent expenditures.

---

# 17. Pay Special Attention to Late Money

Another reason pre-election reports can mislead: they don't cover all the way through Election Day.

Candidate committees generally must separately disclose contributions of $1,000 or more received from a source during the applicable late-contribution window before an election using 48-hour notices.

So during the final weeks of a race, don't ask only:

> What's the latest regular FEC report?

Also check:

> What has been filed **since** that report?

The same principle applies to rapidly reported independent expenditures.

---

# 18. Useful Derived Metrics

I would put these directly into a journalist's spreadsheet.

### Financial position

**Cash growth**
Ending COH − Beginning COH

**Net available cash**
Cash on hand − debts owed

### Fundraising

**Individual share**
Individual contributions / total contributions

**PAC share**
PAC contributions / total contributions

**Candidate financing share**
Candidate contributions + candidate loans / total financial inflows

**Unitemized individual share**
Unitemized individual contributions / total individual contributions

### Spending

**Headline burn rate**
Total disbursements / total receipts

**Operating burn**
Operating expenditures / fundraising receipts

### Debt

**Debt load**
Debts owed / cash on hand

### Donor concentration

**Top-10 donor concentration**
Top 10 itemized donors / total itemized individual contributions

That last metric must be described specifically as a measure of **itemized fundraising**, since unitemized donor information isn't available.

---

# 19. The Best Story Leads to Look For

After doing the basic analysis, I would deliberately look for these patterns:

**Rapid cash depletion**

The campaign is spending substantially faster than it is raising.

**Sudden self-funding**

A candidate loan appears after several weak fundraising periods.

**Vendor concentration**

A surprisingly large percentage of spending goes to one consulting firm or related group of vendors.

**Fundraising costs consuming fundraising**

Large donor-acquisition, digital or direct-mail expenses aren't producing corresponding cash growth.

**Large debt accumulation**

Especially combined with falling cash.

**Large refund spike**

Worth understanding even if perfectly legitimate.

**Geographic donor anomaly**

A supposedly locally powered candidate receives an unusually high proportion of itemized contributions from somewhere else.

**Industry or employer concentration**

A major share of itemized money comes from a particular professional or corporate ecosystem.

**Payments involving campaign insiders**

Candidate family members, former staff, associated companies or politically connected consultants warrant additional reporting.

**Major amendment**

A committee significantly revises previously disclosed receipts, expenditures, cash or debt.

**Late strategic shift**

A sudden surge in polling, media, field or fundraising expenses can reveal a campaign's internal assessment of the race.

None of these things establishes illegality.

They're **reporting leads**.

---

# 20. Common Analytical Mistakes

These are worth putting in a box in any primer.

### Don't add memo entries to their parent transactions

You may double-count the same money.

### Don't treat unitemized contributions as "donors under $200"

They are dollars reported without contributor-level itemization, not a census of donor size.

### Don't compare different coverage periods

Especially around primaries and pre-election reports.

### Don't sum originals and amendments

Use the controlling/latest filing or amendment-aware processed data.

### Don't assume receipts equal fundraising

Loans, transfers and other receipts can distort the number.

### Don't assume disbursements equal actual campaign activity

Transfers, refunds, loan repayments and in-kind accounting can distort that number too.

### Don't assume the payee is the ultimate vendor

Follow memo entries and intermediary payments.

### Don't assume campaign spending equals total spending in the race

Check independent expenditures and party activity.

### Don't assume a strange transaction is illegal

Campaign finance reporting has many accounting conventions that look odd if you aren't familiar with them.

The proper journalistic progression is:

**Identify → verify → understand → investigate → characterize.**

Not:

**Notice something unusual → call it a violation.**

---

# A Practical 15-Minute Filing Review

If I had a new filing and needed to assess it quickly, I would do this in order:

**1. Verify the report**

* committee
* coverage dates
* report type
* amendment status

**2. Write down seven numbers**

* period receipts
* period disbursements
* ending cash
* debt
* individual contributions
* PAC contributions
* candidate contributions/loans

**3. Compare them with the previous report**

Immediately calculate:

* cash growth
* burn rate
* debt change

**4. Scan Schedule A**

Look for:

* candidate money
* major donors
* PAC concentration
* JFC transfers
* unusual contribution spikes

**5. Scan Schedule B**

Sort by amount and identify:

* biggest vendors
* media
* fundraising
* payroll
* digital
* polling
* field
* legal/compliance

**6. Examine Schedule C and D**

Look for:

* candidate loans
* bank loans
* unpaid vendor obligations
* newly incurred debt

**7. Check the broader ecosystem**

Search for:

* independent expenditures
* leadership PAC
* joint fundraising committees
* party expenditures
* late contribution notices

**8. Write the story in one sentence**

Before diving deeper, force yourself to finish:

> "This report shows a campaign that __________."

For example:

> "This report shows a campaign raising strongly but spending nearly everything it brings in."

or:

> "This report shows a candidate whose apparent fundraising surge was largely driven by personal loans."

or:

> "This report shows a campaign stockpiling cash while an allied Super PAC carries much of the advertising burden."

If you can't complete that sentence, you probably don't yet understand the filing.

---

# The Core Principle

The most useful question isn't:

> **How much money did they raise?**

It is:

> **Where did their resources come from, where are those resources going, what resources do they have left, and what does that tell us about the campaign?**

That's the difference between reproducing an FEC report and actually reporting on one.

The FEC's public data system is the best starting point because it lets you move between candidate and committee profiles, filings, receipts, spending, loans/debts and other activity. The agency also maintains a specific collection of resources for journalists.

One final 2026-specific caution: campaign-finance rules are not static. For example, the Supreme Court issued a decision on June 30, 2026 concerning limits on coordinated party expenditures, and the FEC currently warns that some of its existing guidance has not yet been revised to reflect that decision. For journalism involving party coordinated spending, verify the current legal framework rather than relying on an older primer.
