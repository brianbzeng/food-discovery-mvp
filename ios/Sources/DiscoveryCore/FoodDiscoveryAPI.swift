import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public struct DiscoveryContext: Sendable {
    public var latitude: Double?
    public var longitude: Double?
    public var radiusMeters: Int
    public var venueTypes: [VenueType]
    public var priceTiers: [Int]
    public var openNow: Bool
    public var dietaryRestrictions: [String]

    public init(
        latitude: Double? = nil,
        longitude: Double? = nil,
        radiusMeters: Int = 8_000,
        venueTypes: [VenueType] = [],
        priceTiers: [Int] = [],
        openNow: Bool = false,
        dietaryRestrictions: [String] = []
    ) {
        self.latitude = latitude
        self.longitude = longitude
        self.radiusMeters = radiusMeters
        self.venueTypes = venueTypes
        self.priceTiers = priceTiers
        self.openNow = openNow
        self.dietaryRestrictions = dietaryRestrictions
    }
}

public enum InteractionType: String, Codable, Sendable {
    case view, pass, like, save, unsave, detail, share, handoff
    case neverShow = "never_show"
}

public enum FoodDiscoveryAPIError: Error, LocalizedError {
    case invalidResponse
    case server(status: Int, message: String)

    public var errorDescription: String? {
        switch self {
        case .invalidResponse:
            "The discovery service returned an invalid response."
        case let .server(_, message):
            message
        }
    }
}

public actor FoodDiscoveryAPI {
    public let baseURL: URL
    private let session: URLSession
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    public init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    public func feed(
        query: String? = nil,
        context: DiscoveryContext = .init()
    ) async throws -> FeedResponse {
        var components = URLComponents(
            url: baseURL.appending(path: "api/v1/feed"),
            resolvingAgainstBaseURL: false
        )!
        var items: [URLQueryItem] = []
        if let query, !query.isEmpty {
            items.append(.init(name: "q", value: query))
        }
        if let latitude = context.latitude, let longitude = context.longitude {
            items.append(.init(name: "latitude", value: String(latitude)))
            items.append(.init(name: "longitude", value: String(longitude)))
            items.append(.init(name: "radiusMeters", value: String(context.radiusMeters)))
        }
        items.append(contentsOf: context.venueTypes.map {
            .init(name: "venueType", value: $0.rawValue)
        })
        items.append(contentsOf: context.priceTiers.map {
            .init(name: "priceTier", value: String($0))
        })
        items.append(contentsOf: context.dietaryRestrictions.map {
            .init(name: "dietaryRestriction", value: $0)
        })
        if context.openNow {
            items.append(.init(name: "openNow", value: "true"))
        }
        components.queryItems = items
        return try await send(URLRequest(url: components.url!), as: FeedResponse.self)
    }

    public func assistant(
        message: String,
        context: DiscoveryContext = .init()
    ) async throws -> AssistantResponse {
        let body = AssistantRequest(
            message: message,
            latitude: context.latitude,
            longitude: context.longitude,
            radiusMeters: context.radiusMeters,
            openNow: context.openNow,
            venueTypes: context.venueTypes.map(\.rawValue),
            priceTiers: context.priceTiers,
            dietaryRestrictions: context.dietaryRestrictions
        )
        return try await post("api/v1/assistant/messages", body: body)
    }

    public func tasteProfile() async throws -> TasteProfile {
        let envelope: TasteProfileEnvelope = try await get("api/v1/taste-profile")
        return envelope.profile
    }

    public func updateTasteSettings(
        allergens: [String],
        dietaryRestrictions: [String],
        showUnknown: Bool
    ) async throws -> TasteProfile {
        let body = TasteSettingsRequest(
            allergens: allergens,
            dietaryRestrictions: dietaryRestrictions,
            showUnknownAllergyMatches: showUnknown
        )
        let envelope: TasteProfileEnvelope = try await put(
            "api/v1/taste-profile",
            body: body
        )
        return envelope.profile
    }

    public func savedRestaurants() async throws -> [SavedRestaurant] {
        let envelope: SavesEnvelope = try await get("api/v1/saves")
        return envelope.saves
    }

    public func setSaved(_ restaurantID: String, saved: Bool) async throws -> [SavedRestaurant] {
        var request = URLRequest(
            url: baseURL.appending(path: "api/v1/saves/\(restaurantID)")
        )
        request.httpMethod = saved ? "PUT" : "DELETE"
        let envelope = try await send(request, as: SavesEnvelope.self)
        return envelope.saves
    }

    public func restaurant(id: String) async throws -> RestaurantDetails {
        let envelope: RestaurantDetailsEnvelope = try await get(
            "api/v1/restaurants/\(id)"
        )
        return envelope.restaurant
    }

    public func recordInteraction(
        recommendation: Recommendation,
        type: InteractionType,
        reasonCode: String? = nil
    ) async throws -> TasteProfile {
        let body = InteractionRequest(
            restaurantId: recommendation.restaurantId,
            dishCardId: recommendation.dishCardId,
            eventType: type.rawValue,
            reasonCode: reasonCode,
            preferenceKeys: preferenceKeys(for: recommendation.place),
            context: [
                "venueType": recommendation.place.venueType.rawValue,
                "ownershipType": recommendation.place.ownershipType,
                "neighborhood": recommendation.place.neighborhood,
            ]
        )
        let envelope: TasteProfileEnvelope = try await post(
            "api/v1/interactions",
            body: body
        )
        return envelope.profile
    }

    public func account() async throws -> AccountSummary {
        let envelope: AccountEnvelope = try await get("api/v1/account")
        return envelope.account
    }

    private func preferenceKeys(for place: CatalogPlace) -> [String] {
        [
            "venue:\(place.venueType.rawValue)",
            "locality:\(place.ownershipType)",
            "neighborhood:\(place.neighborhood)",
        ] + place.cuisineTags.map { "cuisine:\($0)" }
            + place.dishTags.map { "tag:\($0)" }
    }

    private func get<Response: Decodable>(_ path: String) async throws -> Response {
        try await send(URLRequest(url: baseURL.appending(path: path)), as: Response.self)
    }

    private func post<Body: Encodable, Response: Decodable>(
        _ path: String,
        body: Body
    ) async throws -> Response {
        try await request(path, method: "POST", body: body)
    }

    private func put<Body: Encodable, Response: Decodable>(
        _ path: String,
        body: Body
    ) async throws -> Response {
        try await request(path, method: "PUT", body: body)
    }

    private func request<Body: Encodable, Response: Decodable>(
        _ path: String,
        method: String,
        body: Body
    ) async throws -> Response {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try encoder.encode(body)
        return try await send(request, as: Response.self)
    }

    private func send<Response: Decodable>(
        _ request: URLRequest,
        as type: Response.Type
    ) async throws -> Response {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw FoodDiscoveryAPIError.invalidResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? decoder.decode(ErrorEnvelope.self, from: data))?
                .error.message ?? "The discovery service is temporarily unavailable."
            throw FoodDiscoveryAPIError.server(status: http.statusCode, message: message)
        }
        return try decoder.decode(type, from: data)
    }
}

private struct AssistantRequest: Encodable {
    let message: String
    let latitude: Double?
    let longitude: Double?
    let radiusMeters: Int
    let openNow: Bool
    let venueTypes: [String]
    let priceTiers: [Int]
    let dietaryRestrictions: [String]
}

private struct TasteSettingsRequest: Encodable {
    let allergens: [String]
    let dietaryRestrictions: [String]
    let showUnknownAllergyMatches: Bool
}

private struct InteractionRequest: Encodable {
    let restaurantId: String
    let dishCardId: String
    let eventType: String
    let reasonCode: String?
    let preferenceKeys: [String]
    let context: [String: String]
}

private struct ErrorEnvelope: Decodable {
    struct APIError: Decodable {
        let code: String
        let message: String
    }
    let error: APIError
}
