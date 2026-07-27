# iOS and TestFlight foundation

The iOS client uses the same `/api/v1` contracts, anonymous HTTP-only cookie
identity, ownership eligibility, taste weights, shortlist, and allergy evidence
as the web client. Safety and chain exclusion remain server-authoritative.

## What is included

- `DiscoveryCore`: a Swift package containing Codable API models and the
  cookie-preserving async API client
- `FoodDiscoveryApp`: SwiftUI discovery, conversational search, shortlist,
  settings, and restaurant-detail screens built from native navigation, list,
  tab, and accessibility patterns
- `project.yml`: a reproducible XcodeGen application project definition
- model decoding tests for food and beverage recommendations

## Generate and run the app

1. Install the current stable Xcode and accept its license.
2. Install XcodeGen: `brew install xcodegen`.
3. From this directory, run `xcodegen generate`.
4. Open `FoodDiscovery.xcodeproj`.
5. Choose an iPhone simulator and run `FoodDiscoveryApp`.

The Debug base URL is `http://localhost:3000`. A physical device cannot resolve
the Mac as `localhost`; set `FOOD_API_BASE_URL` to an HTTPS preview deployment
or a reachable development address.

## Before the first TestFlight upload

- Replace `com.example.fooddiscovery` with the final bundle identifier.
- Set the Apple Developer team and automatic signing in Xcode.
- Replace the Release `FOOD_API_BASE_URL` placeholder with the production HTTPS
  deployment.
- Add the final product name, app icon, accent color, launch treatment, privacy
  policy URL, support URL, category, age rating, and App Store description.
- Confirm production D1 migrations, R2 bindings, sign-in redirects, account
  export/deletion, menu/call/directions handoffs, and source attribution.
- Run unit tests, VoiceOver, Dynamic Type, dark mode, poor-network, denied
  location, and allergen evidence checks on a real device.
- Archive the Release scheme, validate it, upload to App Store Connect, add
  internal testers, and complete export-compliance and privacy answers.

Full Xcode is required for simulator tests, signing, archives, and TestFlight.
The platform-independent package can be checked with `swift build`.
