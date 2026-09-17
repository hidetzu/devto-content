---
title: "The Same Row Twice: Four Things Keyset Pagination Needs"
published: false
description: "The real reason to drop OFFSET is not speed - it is that page 2 can show you a row you already saw. Here is what replacing it actually costs to build."
tags: postgresql, sql, api, database
canonical_url: ""
canonical_exempt: "Part 1 holds the canonical for this Zenn article; DEV allows only one"
cover_image: ""
series: "Pagination at 10 million rows"
zenn_source: offset-vs-cursor-pagination
devto_id: 4662228
---

Speed is OFFSET's second problem. The first is that page 2 can hand you a row you already read on page 1 — and no index will fix it, because it is not a performance bug.

Part 1 of this series measured why deep OFFSET is O(depth): at depth 9,999,980 PostgreSQL reads ten million rows and discards all but twenty. This is the other half — why you would switch even on a table small enough that nobody notices the speed, and the four things a keyset cursor needs before it works.

## Page 2 shows you page 1's row

Ten rows, three per page, newest first.

```sql
CREATE TEMP TABLE feed(id int PRIMARY KEY, name text);
INSERT INTO feed SELECT n, 'item' || n FROM generate_series(1, 10) n;

SELECT id, name FROM feed ORDER BY id DESC LIMIT 3 OFFSET 0;
```

```text
 id |  name
----+--------
 10 | item10
  9 | item9
  8 | item8
```

Now one row arrives before the user taps "next":

```sql
INSERT INTO feed VALUES (11, 'item11');

SELECT id, name FROM feed ORDER BY id DESC LIMIT 3 OFFSET 3;
```

```text
 id | name
----+-------
  8 | item8
  7 | item7
  6 | item6
```

`item8` came back. OFFSET 3 does not mean "after the three you saw" — it means "the 4th onward *in the ordering as it stands now*". One insert above the window shifted everything down by one.

Delete a row instead and the same arithmetic runs backwards: a row slides up past the boundary and is never shown at all. The user cannot reach it by paging.

A cursor asks a different question:

```sql
SELECT id, name FROM feed WHERE id < 8 ORDER BY id DESC LIMIT 3;
```

```text
 id | name
----+-------
  7 | item7
  6 | item6
  5 | item5
```

Correct, because the cursor names a **position** (`id = 8`), not a **rank** ("the 4th"). Other people's inserts move ranks. They do not move positions.

This is the duplicated post in your infinite-scroll timeline. It is OFFSET's semantics, so it survives every index you add.

### Where keyset still breaks

Keyset is not immune to everything, and it is worth being precise about what it fixes. It removes boundary drift caused by rows appearing or disappearing *elsewhere* in the set, because those rows change ranks and the cursor does not use ranks.

It does not help when the sort key of a row you already passed changes. Order a feed by `updated_at DESC`, let someone edit an old post, and that row jumps ahead of your cursor — you will see it a second time. Order by `total_amount` and let an amount change, and a row can move behind your cursor and never be returned.

The rule that falls out of this: **order by something that does not move.** `created_at` plus a primary key is a good default precisely because neither value is ever rewritten. If the product genuinely needs "most recently updated first", accept that pagination over it is approximate and say so, rather than pretending a cursor made it exact.

So: four things.

## 1. A tiebreaker, as a row comparison

A cursor on `created_at` alone breaks the moment two rows share a value. In my 10M-row table they do, by construction:

```sql
SELECT created_at, count(*) FROM orders
WHERE id BETWEEN 5000001 AND 5000100 GROUP BY created_at;
```

```text
       created_at       | count
------------------------+-------
 2025-01-01 13:53:20+00 |   100
```

One hundred rows on the same timestamp. `WHERE created_at < :cursor` cannot express *where inside those hundred* the last page ended, so you get duplicates or gaps — the exact problem you switched to fix.

Add the primary key as a tiebreaker, and write it as a row comparison:

```sql
SELECT id, created_at
FROM orders
WHERE (created_at, id) < (:last_created_at, :last_id)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

`(a, b) < (x, y)` means "a < x, or a = x and b < y". Writing it that way is not cosmetic: PostgreSQL can push a row comparison into a composite index as a single `Index Cond`. Expand it into `OR` by hand and you can lose the index.

## 2. An index that satisfies the column order *and* the directions

```sql
CREATE INDEX orders_created_at_id_desc_idx
    ON orders (created_at DESC, id DESC);
```

With that in place, at the same depth that cost OFFSET 110,659 pages:

```text
 Limit  (actual time=0.026..0.028 rows=20 loops=1)
   ->  Index Only Scan using orders_created_at_id_desc_idx on orders
         Index Cond: (ROW(created_at, id) < ROW('2025-01-01 13:53:20+00', 5000001))
         Heap Fetches: 0
         Buffers: shared read=4
 Execution Time: 0.062 ms
```

Four pages. 0.062 ms.

The common advice — "a DESC query needs a DESC index" — is not quite it. A B-tree walks backwards perfectly well, so **flipping every column at once is free**. Ask this DESC/DESC index for `ORDER BY created_at ASC, id ASC`:

```text
 ->  Index Only Scan Backward using orders_created_at_id_desc_idx on orders
       (actual time=0.015..0.016 rows=20 loops=1)
 Execution Time: 0.030 ms
```

`Backward`, and no sort node.

What breaks is **mixing directions between columns**. `ORDER BY created_at DESC, id ASC`:

```text
 ->  Incremental Sort  (actual time=0.088..0.089 rows=20 loops=1)
       Sort Key: created_at DESC, id
       ->  Index Only Scan using orders_created_at_id_desc_idx on orders
             (actual time=0.015..0.020 rows=101 loops=1)
 Execution Time: 0.105 ms
```

An `Incremental Sort` appears. Here it is cheap — only 101 rows, because ties run 100 deep — and it would be easy to look at 0.105 ms and move on.

For keyset, that timing badly understates the damage. The sort is the visible symptom; the real loss is that with directions mixed, `(created_at, id) < (...)` no longer collapses into a single `Index Cond`. The cursor predicate stops being something the index can seek on, which is the entire mechanism that made the query independent of depth. You are back to scanning and filtering — the shape of the problem part 1 was about, reintroduced by a sort clause that looked harmless.

The requirement is not "make it DESC". It is: **a B-tree matching your column order and your direction pattern.** Want mixed directions? That is a second index.

## 3. Cursors clients cannot read

Expose `?after_id=9999980` and within a week someone's client is doing `+1` to get the next page. You can never change the sort order again.

Encode the whole cursor and make it opaque:

```go
type cursor struct {
    CreatedAt time.Time `json:"c"`
    ID        int64     `json:"i"`
}

func encode(c cursor) (string, error) {
    b, err := json.Marshal(c)
    if err != nil {
        return "", err
    }
    return base64.RawURLEncoding.EncodeToString(b), nil
}
```

Base64 is encoding, not encryption — readable and forgeable. Add an HMAC if you need to reject tampering. Include which sort order issued the cursor, so switching order invalidates old ones instead of silently returning nonsense.

## 4. Total count is a separate problem

"Page 1 of 1,234" needs this, and keyset does nothing for it:

```text
 Finalize Aggregate  (actual time=243.851..248.230 rows=1 loops=1)
   ->  Gather  (actual time=243.751..248.222 rows=3 loops=1)
         Workers Planned: 2
         ->  Partial Aggregate  (actual time=234.020..234.020 rows=1 loops=3)
               ->  Parallel Seq Scan on orders
                     (actual time=0.009..129.056 rows=3333333 loops=3)
 Execution Time: 259.813 ms
```

260 ms across three processes — a leader plus two workers (`max_parallel_workers_per_gather` is 2 by default; `loops=3` is those three, not all 16 threads).

The fix is to want it less. Usually the UI only needs "is there more", which is `LIMIT 21` and checking whether a 21st row came back — you discard the extra row and report its existence as a boolean.

That falls out of the response shape a cursor API wants anyway:

```json
{
  "items": [ "...20 rows..." ],
  "next_cursor": "eyJjIjoiMjAyNS0wMS0wMVQxMzo1MzoyMFoiLCJpIjo1MDAwMDAxfQ",
  "has_more": true
}
```

No total, no page number, and `next_cursor` is null on the last page. If an estimate is good enough for a "roughly N results" label, `pg_class.reltuples` is free.

## Which one to use

OFFSET is not a mistake. It has a domain.

| | OFFSET | Cursor (keyset) |
|---|---|---|
| Deep pages | O(depth) | Flat |
| Jump to page N | Yes | No — next/prev only |
| Total pages | Yes (count costs extra) | Usually not offered |
| Concurrent writes | **Duplicates and gaps** | Robust to inserts/deletes elsewhere |
| Build cost | Nothing | Tiebreaker, index, encoding |
| Switchable sort order | Free | An index and cursor format per order |

**Stay on OFFSET** when the result set tops out in the thousands, when page numbers go in URLs to be bookmarked and shared, when jumping to an arbitrary page is a real requirement, or when the data is frozen while being read (a closed report).

**Use a cursor** for infinite scroll, timelines and notification feeds; for exports and batch reads; for public APIs where you do not control how deep clients go; and for anything on a table that is being written to continuously.

They also coexist. Page-numbered admin screens on OFFSET and a cursor-based public API is a normal split. Just cap the depth on the OFFSET side — an endpoint that accepts `offset=9999980` from anyone is a free denial-of-service handle, as part 1's 110,659 pages per request should make obvious.

## Takeaway

Switch off OFFSET when rows shift under your users, not when the page feels slow — and budget for a tiebreaker, an index per sort order, an opaque cursor, and a separate answer for "how many".
