import Combine
import DiscoveryCore
import Foundation

@MainActor
final class AppModel: ObservableObject {
    @Published var recommendations: [Recommendation] = []
    @Published var savedIDs: Set<String> = []
    @Published var savedPlaces: [RestaurantDetails] = []
    @Published var profile: TasteProfile?
    @Published var interpretation: [AssistantChip] = []
    @Published var context = DiscoveryContext(openNow: true)
    @Published var status = "Finding reviewed local places…"
    @Published var isLoading = false

    let api: FoodDiscoveryAPI

    init(api: FoodDiscoveryAPI) {
        self.api = api
    }

    var current: Recommendation? { recommendations.first }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let feed = try await api.feed(context: context)
            recommendations = feed.recommendations
            profile = try await api.tasteProfile()
            try await reloadSaved()
            status = feed.recommendations.isEmpty
                ? "No eligible match in this set."
                : "\(feed.meta.returned) reviewed local picks"
        } catch {
            status = error.localizedDescription
        }
    }

    func search(_ message: String) async {
        let query = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let response = try await api.assistant(
                message: query,
                context: context
            )
            recommendations = response.recommendations
            interpretation = response.interpretation.chips
            status = response.assistantMessage
        } catch {
            status = error.localizedDescription
        }
    }

    func act(_ type: InteractionType) async {
        guard let current else { return }
        do {
            profile = try await api.recordInteraction(
                recommendation: current,
                type: type
            )
            if type == .pass || type == .like {
                recommendations.removeFirst()
            }
        } catch {
            status = error.localizedDescription
        }
    }

    func toggleSaved(_ recommendation: Recommendation) async {
        let shouldSave = !savedIDs.contains(recommendation.restaurantId)
        do {
            let saves = try await api.setSaved(
                recommendation.restaurantId,
                saved: shouldSave
            )
            savedIDs = Set(saves.map(\.restaurantId))
            _ = try await api.recordInteraction(
                recommendation: recommendation,
                type: shouldSave ? .save : .unsave
            )
            try await reloadSaved()
        } catch {
            status = error.localizedDescription
        }
    }

    func saveSettings(
        allergens: [String],
        dietaryRestrictions: [String],
        showUnknown: Bool
    ) async {
        do {
            profile = try await api.updateTasteSettings(
                allergens: allergens,
                dietaryRestrictions: dietaryRestrictions,
                showUnknown: showUnknown
            )
            context.dietaryRestrictions = dietaryRestrictions
            await load()
        } catch {
            status = error.localizedDescription
        }
    }

    func reloadSaved() async throws {
        let saves = try await api.savedRestaurants()
        savedIDs = Set(saves.map(\.restaurantId))
        var places: [RestaurantDetails] = []
        for save in saves {
            if let place = try? await api.restaurant(id: save.restaurantId) {
                places.append(place)
            }
        }
        savedPlaces = places
    }
}
