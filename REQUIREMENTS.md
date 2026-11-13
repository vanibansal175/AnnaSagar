# AnnaSagar - Finalized Product Requirements and MVP Decisions

AnnaSagar is a free food-sharing platform that connects people and organizations with surplus (leftover) food to people who need it. The goal is to reduce food wastage and make surplus food accessible to the community.

These are the finalized MVP decisions and the source of truth for architecture, database design, implementation planning, UI development and testing. Do not introduce additional features or change these requirements. If a technical implementation detail is not specified, choose a sensible, secure, free-tier-compatible solution rather than changing the product requirements.

## 1. User Types

There are two primary user types:

**A. Donors (Food Providers)**
- Individuals and home cooks
- Hostel and PG kitchens
- Restaurants and cafes
- NGOs and community kitchens
- Event organizers with surplus food

**B. Receivers (Food Collectors)**
- Anyone who wants to collect free food.
- Students, workers, people in need, and other community members.

Food is completely FREE. There must be no payments, transactions, commissions, or monetization features in the MVP.

## 2. Authentication and Authorization

- Email and password registration and login.
- Registration collects the user's name and email.
- Passwords must be securely hashed.
- Google authentication can be included only if it can be implemented without introducing paid dependencies.
- No phone OTP authentication.
- Implement role-based access control.
- Regular users must not be able to access admin functionality.

## 3. Admin System

An admin role is required.

Admin capabilities:
- View all registered users.
- View all food listings.
- Remove inappropriate or invalid food listings.
- Block or suspend users violating platform rules.
- Review reported users and listings if reporting is implemented later.
- Monitor platform activity.

Keep admin functionality separate from the regular user experience.

## 4. Location and Food Pickup Address

The platform initially targets a city/campus-level community, with an architecture that can support expansion to multiple cities.

Every food listing MUST contain a complete pickup address.

Mandatory address fields:
- House/building name or number
- Street/area
- Landmark
- City
- State
- PIN code

Important:
- Do not use approximate location as a substitute for the pickup address.
- Do not make the pickup address optional.
- Display the pickup address clearly to the receiver after claiming the food.
- Avoid unnecessary live GPS tracking.
- An interactive map is not required for the MVP.

## 5. Food Listing / Posting

| Field | Requirement |
|---|---|
| Food name | Mandatory |
| Food image | MANDATORY |
| Number of servings | Mandatory |
| Food category | Mandatory: Veg / Non-veg / Egg |
| Cooked-at time | Mandatory |
| Pickup deadline | Mandatory |
| Complete pickup address | Mandatory |
| Landmark | Mandatory |
| City | Mandatory |
| State | Mandatory |
| PIN code | Mandatory |
| Donor contact | Mandatory |
| Allergens | Optional |
| Packaging details | Optional |
| Food description | Optional |

Food image requirements:
- Every listing MUST have at least one uploaded food image.
- Do not allow a listing to be published without an image.
- Validate image type and size.
- Store uploaded images using a free image-storage solution.
- Show image previews before submission.
- Handle image upload failures gracefully.

## 6. Food Discovery and Browsing

Receivers should be able to:
- Browse all active food listings.
- View food images.
- View food name, category and available servings.
- See the cooked-at time.
- See the pickup deadline with a live countdown.
- See the pickup area and address details.
- View donor information according to the platform's privacy rules.
- Sort listings by soonest pickup deadline.
- Filter listings by food category and city/area.

The interface should clearly distinguish available, claimed and expired listings.

## 7. Claiming System

One receiver can claim one entire food listing.

Expected workflow:
1. Donor creates a food listing.
2. Listing becomes AVAILABLE.
3. Receiver clicks Claim Food.
4. Listing becomes CLAIMED.
5. Other receivers cannot claim that listing.
6. Donor and receiver can see the updated status.
7. Receiver collects the food.
8. Donor marks it as COLLECTED.

Additional rules:
- Donor can cancel their listing.
- Receiver can cancel their claim.
- Cancelled claims make the listing available again if the pickup deadline has not passed.
- Prevent multiple users from claiming the same listing simultaneously using proper database transactions or atomic operations.
- Do not rely only on frontend button disabling for claim protection.
- Food listings do not support partial claiming in the MVP.

## 8. Listing Status and Expiry

Required statuses:
- AVAILABLE
- CLAIMED
- COLLECTED
- EXPIRED
- CANCELLED

Expiry rules:
- Donor selects the pickup deadline while posting food.
- Show a live countdown on active food cards.
- Automatically expire listings once their pickup deadline passes.
- Expired listings must disappear from the active food feed.
- Keep historical records in the database.
- Donors must create a new listing to repost expired food.
- Do not assume that food is safe simply because its countdown has not expired. Include an appropriate food-safety disclaimer and enforce reasonable configurable listing-duration limits.

## 9. Notifications

Implement in-app notifications only.

Required notification scenarios:
- Someone claims a donor's food.
- A receiver's claim is cancelled.
- Food is marked as collected.
- A listing is approaching its pickup deadline.
- A listing expires.

No paid SMS or external notification services are required.

## 10. Language

English only for the initial MVP.

## 11. Target Users and Performance

The initial target is:
- At least 50 registered/onboarded users.
- Approximately 10-15 simultaneously active users.
- Responsive interface for mobile, tablet and desktop.
- Reliable authentication and authorization.
- No duplicate food claims.
- Correct expiry handling.
- Proper validation and error handling.
- Secure handling of user data.
- Efficient database queries and appropriate indexes.

Do not claim support for 50 concurrent users unless actual load testing demonstrates it.

## 12. Explicitly Out of Scope for MVP

Do not implement:
- Payment gateways
- Paid subscriptions
- Commission systems
- Chat or messaging systems
- Phone OTP
- Live GPS tracking
- Complicated interactive maps
- Multiple receivers claiming portions of the same listing
- Ratings and reviews
- Complex recommendation algorithms
- Multilingual support
- Email and SMS notification systems

These can be considered for future versions.

## 13. Core User Journey

Donor: Register -> Login -> Upload food image -> Enter food details -> Enter complete pickup address -> Set pickup deadline -> Publish listing.

Receiver: Register -> Login -> Browse available food -> View food details -> Claim food -> Access pickup address -> Collect food.

After collection: Donor marks food as collected -> Listing becomes unavailable.

Automatic system: Monitor pickup deadlines -> Expire overdue listings -> Remove them from the active feed.

## 14. Product Development Principles

- Build a functional application, not just an attractive UI prototype.
- Prioritize reliability, security and usability.
- Never use mock data as a substitute for real backend functionality in the completed MVP.
- Validate all important inputs on both frontend and backend.
- Handle concurrent food claims safely.
- Ensure uploaded images are actually stored and retrievable.
- Ensure pickup addresses are saved correctly and shown to authorized users.
- Make the application responsive.
- Avoid unnecessary complexity and paid services.
- Keep the code modular, maintainable and easy to extend.

---

## RESOLVED DECISIONS (these override anything ambiguous above)

D1. Product: AnnaSagar shares LEFTOVER (surplus) cooked food, not freshly made food to order.

D2. Roles: "user" and "admin". One user account can donate (post) and receive (claim). A user can never claim their own listing. Registration collects name, email and password only. Donor type (individual, hostel/PG, restaurant/cafe, NGO, event organizer) is an optional profile field.

D3. Admin accounts are never created through public signup. The first admin is created by a seed script that reads ADMIN_EMAIL and ADMIN_PASSWORD from environment variables.

D4. Google login is NOT in the core MVP build. Design auth so it can be added later.

D5. Privacy: before claiming, receivers see food details, image(s), servings, category, cooked-at, countdown, donor display name, street/area, city, state and PIN. Only AFTER claiming (and to the donor and admin) are house/building, landmark and donor contact visible.

D6. Time rules (all configurable by environment variable):
- MAX_LISTING_DURATION_MINUTES=180 (pickup deadline minus posting time)
- MIN_LISTING_DURATION_MINUTES=45
- MAX_FOOD_AGE_AT_PICKUP_MINUTES=240 (pickup deadline minus cooked-at time)
- WARNING_MINUTES=30 (last 30 minutes before the deadline = warning stage)
- cooked-at must not be in the future.

D7. The warning stage is DERIVED (AVAILABLE and within WARNING_MINUTES of the deadline), not a stored status. Stored statuses: AVAILABLE, CLAIMED, COLLECTED, EXPIRED, CANCELLED.

D8. A food-safety disclaimer is shown on every card and detail page. A receiver must tick "I understand" before every claim. The acknowledgement time is stored.

D9. A CLAIMED listing that is not marked COLLECTED by its deadline becomes EXPIRED. Only the donor can mark COLLECTED.

D10. Images: 1 to 3 per listing, max 5 MB each, jpg/png/webp. Uploaded through the backend to the Cloudinary folder "annasagar". Only Cloudinary URLs from our own folder are accepted on listings.

D11. PIN code is a 6-digit Indian PIN. Reporting, ratings, chat and email notifications are out of scope.

D12. Listings and claim history are never hard-deleted by users. Admin removal is a soft removal with a reason, recorded in an audit log.

D13. Vercel hosts ONLY the frontend. Render hosts ONLY the backend.