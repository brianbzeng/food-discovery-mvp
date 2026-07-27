import XCTest
@testable import DiscoveryCore

final class APIModelsTests: XCTestCase {
    func testDecodesEligibleBobaRecommendation() throws {
        let data = Data(fixture.utf8)
        let response = try JSONDecoder().decode(FeedResponse.self, from: data)

        XCTAssertEqual(response.meta.returned, 1)
        XCTAssertEqual(response.recommendations.first?.place.venueType, .boba)
        XCTAssertEqual(
            response.recommendations.first?.place.ownershipType,
            "independent"
        )
        XCTAssertEqual(
            response.recommendations.first?.warnings.first?.code,
            "allergen-unknown"
        )
    }

    func testVenueLabelsCoverFoodAndBeveragePlaces() {
        XCTAssertEqual(VenueType.cafe.label, "Café")
        XCTAssertEqual(VenueType.boba.label, "Boba")
        XCTAssertEqual(VenueType.teaHouse.rawValue, "tea_house")
    }
}

private let fixture = """
{
  "recommendations": [{
    "restaurantId": "restaurant-half-light-tea",
    "dishCardId": "demo-half-light-tea",
    "score": 93,
    "scoreComponents": {
      "context": 100,
      "taste": 70,
      "distance": 85,
      "price": 100,
      "dataQuality": 80,
      "novelty": 75
    },
    "matchReasons": ["Independent local business"],
    "warnings": [{
      "code": "allergen-unknown",
      "message": "peanut information is unknown; confirm directly."
    }],
    "evidenceIds": [],
    "place": {
      "restaurantId": "restaurant-half-light-tea",
      "dishCardId": "demo-half-light-tea",
      "restaurantName": "Half-Light Tea",
      "venueType": "boba",
      "ownershipType": "independent",
      "neighborhood": "Hayes Valley",
      "latitude": 37.77,
      "longitude": -122.42,
      "cuisineTags": ["Taiwanese"],
      "dishTags": ["Boba"],
      "title": "Roasted oolong brown-sugar boba",
      "description": "Tea-forward drink",
      "priceTier": 1,
      "priceDisplay": "$",
      "phone": null,
      "websiteUrl": null,
      "menuUrl": null,
      "directionsUrl": null,
      "serviceModes": ["Walk-in"],
      "verifiedAt": 1785110400000,
      "evidence": []
    }
  }],
  "meta": {
    "eligibleCandidates": 1,
    "returned": 1,
    "ownershipPolicy": "independent-and-reviewed-local-only",
    "generatedAt": "2026-07-26T00:00:00.000Z"
  }
}
"""
