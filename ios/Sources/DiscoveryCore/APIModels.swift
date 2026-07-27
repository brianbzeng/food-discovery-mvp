import Foundation

public enum VenueType: String, Codable, CaseIterable, Identifiable, Sendable {
    case restaurant
    case cafe
    case boba
    case teaHouse = "tea_house"
    case bakery
    case dessert
    case juiceBar = "juice_bar"

    public var id: String { rawValue }

    public var label: String {
        switch self {
        case .restaurant: "Restaurant"
        case .cafe: "Café"
        case .boba: "Boba"
        case .teaHouse: "Tea house"
        case .bakery: "Bakery"
        case .dessert: "Dessert"
        case .juiceBar: "Juice bar"
        }
    }
}

public struct RestrictionEvidence: Codable, Identifiable, Sendable {
    public let id: String
    public let restrictionKey: String
    public let status: String
    public let sourceType: String
    public let sourceURL: String?
    public let merchantConfirmed: Bool
    public let verifiedAt: Int?
    public let notes: String?

    enum CodingKeys: String, CodingKey {
        case id, restrictionKey, status, sourceType, merchantConfirmed, verifiedAt, notes
        case sourceURL = "sourceUrl"
    }
}

public struct CatalogPlace: Codable, Identifiable, Sendable {
    public let restaurantId: String
    public let dishCardId: String
    public let restaurantName: String
    public let venueType: VenueType
    public let ownershipType: String
    public let neighborhood: String
    public let latitude: Double
    public let longitude: Double
    public let cuisineTags: [String]
    public let dishTags: [String]
    public let title: String
    public let description: String
    public let priceTier: Int
    public let priceDisplay: String?
    public let phone: String?
    public let websiteUrl: String?
    public let menuUrl: String?
    public let directionsUrl: String?
    public let serviceModes: [String]
    public let verifiedAt: Int?
    public let evidence: [RestrictionEvidence]

    public var id: String { dishCardId }
}

public struct RecommendationWarning: Codable, Hashable, Sendable {
    public let code: String
    public let message: String
}

public struct ScoreComponents: Codable, Sendable {
    public let context: Int
    public let taste: Int
    public let distance: Int
    public let price: Int
    public let dataQuality: Int
    public let novelty: Int
}

public struct Recommendation: Codable, Identifiable, Sendable {
    public let restaurantId: String
    public let dishCardId: String
    public let score: Int
    public let scoreComponents: ScoreComponents
    public let matchReasons: [String]
    public let warnings: [RecommendationWarning]
    public let evidenceIds: [String]
    public let place: CatalogPlace

    public var id: String { dishCardId }
}

public struct FeedMeta: Codable, Sendable {
    public let eligibleCandidates: Int
    public let returned: Int
    public let ownershipPolicy: String
    public let generatedAt: String
}

public struct FeedResponse: Codable, Sendable {
    public let recommendations: [Recommendation]
    public let meta: FeedMeta
}

public struct AssistantChip: Codable, Identifiable, Sendable {
    public let key: String
    public let label: String
    public var id: String { key }
}

public struct AssistantInterpretation: Codable, Sendable {
    public let chips: [AssistantChip]
    public let confidence: Double
    public let openNow: Bool?
}

public struct AssistantResponse: Codable, Sendable {
    public let assistantMessage: String
    public let interpretation: AssistantInterpretation
    public let recommendations: [Recommendation]
    public let meta: FeedMeta
}

public struct TasteProfile: Codable, Sendable {
    public let learnedWeights: [String: Double]
    public let strongestSignals: [String]
    public let totalSignals: Int
    public let version: Int
    public let dietaryRestrictions: [String]
    public let allergens: [String]
    public let showUnknownAllergyMatches: Bool
}

public struct TasteProfileEnvelope: Codable, Sendable {
    public let profile: TasteProfile
}

public struct SavedRestaurant: Codable, Identifiable, Sendable {
    public let restaurantId: String
    public let createdAt: Int
    public var id: String { restaurantId }
}

public struct SavesEnvelope: Codable, Sendable {
    public let saves: [SavedRestaurant]
}

public struct RestaurantAddress: Codable, Sendable {
    public let line1: String?
    public let city: String?
    public let region: String?
    public let postalCode: String?
}

public struct RestaurantHours: Codable, Identifiable, Sendable {
    public let dayOfWeek: Int
    public let opensAt: String?
    public let closesAt: String?
    public let isClosed: Bool
    public let sourceType: String
    public let verifiedAt: Int?

    public var id: String {
        "\(dayOfWeek)-\(opensAt ?? "closed")-\(closesAt ?? "closed")"
    }
}

public struct RestaurantDetails: Codable, Identifiable, Sendable {
    public let id: String
    public let name: String
    public let venueType: VenueType
    public let ownershipType: String
    public let neighborhood: String
    public let address: RestaurantAddress
    public let timezone: String?
    public let latitude: Double
    public let longitude: Double
    public let phone: String?
    public let websiteUrl: String?
    public let menuUrl: String?
    public let directionsUrl: String?
    public let serviceModes: [String]
    public let verifiedAt: Int?
    public let hours: [RestaurantHours]
    public let evidence: [RestrictionEvidence]
}

public struct RestaurantDetailsEnvelope: Codable, Sendable {
    public let restaurant: RestaurantDetails
}

public struct AccountSummary: Codable, Sendable {
    public let authenticated: Bool
    public let principalType: String
    public let savedCount: Int
    public let interactionCount: Int
}

public struct AccountEnvelope: Codable, Sendable {
    public let account: AccountSummary
}
