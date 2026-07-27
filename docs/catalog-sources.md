# Catalog source operations

## OpenStreetMap candidate discovery

The first provider adapter uses OpenStreetMap through Overpass for low-volume,
operator-triggered candidate discovery. It is not called from consumer feed or
search requests.

- Candidate elements are limited by radius and enter `catalog_imports`.
- `amenity=restaurant`, `amenity=cafe`, related food amenities, and
  `cuisine=bubble_tea` are normalized into the product's venue types.
- Brand and franchise tags are ownership signals, not publication decisions.
- Every candidate remains non-public until an ownership review marks the linked
  restaurant `eligible`.
- Source URLs and `© OpenStreetMap contributors, ODbL 1.0` attribution travel
  with imported records.
- The public Overpass service is suitable only for modest operational use. A
  production-scale importer must use an appropriate hosted provider or regional
  extracts rather than consumer-request fan-out.

References:

- [OpenStreetMap cuisine tagging](https://wiki.openstreetmap.org/wiki/Key%3Acuisine)
- [OpenStreetMap bubble-tea tagging](https://wiki.openstreetmap.org/wiki/Tag%3Acuisine%3Dbubble_tea)
- [OpenStreetMap API usage policy](https://operations.osmfoundation.org/policies/api/)

## Media publication

Media bytes live in R2 and metadata lives in D1. An asset is eligible only when
it has a rights holder, a documented license basis, an `approved` review state,
and no expired rights window. Rejected, pending, or expired media is never
returned by public catalog queries.

