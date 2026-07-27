import DiscoveryCore
import SwiftUI

struct DiscoveryView: View {
    @EnvironmentObject private var model: AppModel
    @State private var prompt = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 18) {
                    search
                    LocalOnlyBanner()
                    filters
                    status

                    if model.isLoading && model.recommendations.isEmpty {
                        ProgressView("Finding local spots…")
                            .frame(maxWidth: .infinity, minHeight: 260)
                    } else if let recommendation = model.current {
                        RecommendationCard(recommendation: recommendation)
                    } else {
                        ContentUnavailableView(
                            "No reviewed match",
                            systemImage: "fork.knife.circle",
                            description: Text(
                                "Try a broader craving while your safety and local-only rules stay in place."
                            )
                        )
                    }
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Food nearby")
            .refreshable { await model.load() }
        }
    }

    private var search: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
            TextField(
                "Oolong boba or a quiet café…",
                text: $prompt
            )
            .textInputAutocapitalization(.never)
            .submitLabel(.search)
            .onSubmit {
                let query = prompt
                prompt = ""
                Task { await model.search(query) }
            }
            Button {
                let query = prompt
                prompt = ""
                Task { await model.search(query) }
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.title2)
            }
            .disabled(prompt.trimmingCharacters(in: .whitespaces).isEmpty)
            .accessibilityLabel("Search")
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 16))
    }

    private var filters: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack {
                Toggle("Open now", isOn: $model.context.openNow)
                    .toggleStyle(.button)
                ForEach([VenueType.cafe, .boba, .restaurant]) { venue in
                    Button {
                        if model.context.venueTypes.contains(venue) {
                            model.context.venueTypes.removeAll { $0 == venue }
                        } else {
                            model.context.venueTypes.append(venue)
                        }
                        Task { await model.load() }
                    } label: {
                        Label(venue.label, systemImage: symbol(for: venue))
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(
                        model.context.venueTypes.contains(venue)
                            ? .foodAccent
                            : Color(.tertiarySystemFill)
                    )
                    .foregroundStyle(
                        model.context.venueTypes.contains(venue)
                            ? .black
                            : .primary
                    )
                }
            }
        }
        .onChange(of: model.context.openNow) {
            Task { await model.load() }
        }
    }

    private var status: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(model.status)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
            if !model.interpretation.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(model.interpretation) { chip in
                            Text(chip.label)
                                .font(.caption.weight(.semibold))
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(
                                    Color.foodAccent.opacity(0.45),
                                    in: .capsule
                                )
                        }
                    }
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func symbol(for venue: VenueType) -> String {
        switch venue {
        case .cafe: "cup.and.saucer"
        case .boba, .teaHouse: "takeoutbag.and.cup.and.straw"
        default: "fork.knife"
        }
    }
}

private struct RecommendationCard: View {
    @EnvironmentObject private var model: AppModel
    let recommendation: Recommendation

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            NavigationLink {
                PlaceDetailView(restaurantID: recommendation.restaurantId)
            } label: {
                hero
            }
            .buttonStyle(.plain)

            if let warning = recommendation.warnings.first {
                Label(warning.message, systemImage: "exclamationmark.triangle.fill")
                    .font(.caption)
                    .foregroundStyle(.primary)
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.orange.opacity(0.2))
            }

            HStack {
                action("Not now", "xmark", .pass)
                Button {
                    Task { await model.toggleSaved(recommendation) }
                } label: {
                    Label(
                        "Save",
                        systemImage: model.savedIDs.contains(recommendation.restaurantId)
                            ? "heart.fill" : "heart"
                    )
                }
                .buttonStyle(.bordered)
                action("More", "arrow.right", .like)
            }
            .padding()
        }
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(.rect(cornerRadius: 24))
        .overlay {
            RoundedRectangle(cornerRadius: 24)
                .stroke(Color.primary.opacity(0.14))
        }
    }

    private var hero: some View {
        ZStack(alignment: .bottomLeading) {
            LinearGradient(
                colors: [.foodCoral, .black.opacity(0.8)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            Image(systemName: symbol)
                .font(.system(size: 110, weight: .thin))
                .foregroundStyle(.white.opacity(0.16))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            VStack(alignment: .leading, spacing: 8) {
                Text("\(recommendation.score)% MATCH")
                    .font(.caption2.monospaced().weight(.bold))
                    .padding(.horizontal, 9)
                    .padding(.vertical, 6)
                    .background(Color.foodAccent, in: .capsule)
                    .foregroundStyle(.black)
                Spacer()
                Text(recommendation.place.title)
                    .font(.largeTitle)
                    .fontDesign(.serif)
                    .fontWeight(.semibold)
                Text(recommendation.place.restaurantName)
                    .font(.headline)
                Text(
                    "\(recommendation.place.venueType.label) · \(recommendation.place.neighborhood) · \(recommendation.place.priceDisplay ?? "")"
                )
                .font(.caption)
                .foregroundStyle(.white.opacity(0.8))
            }
            .foregroundStyle(.white)
            .padding(20)
        }
        .frame(minHeight: 390)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Opens restaurant details")
    }

    private var symbol: String {
        switch recommendation.place.venueType {
        case .cafe: "cup.and.saucer.fill"
        case .boba, .teaHouse: "takeoutbag.and.cup.and.straw.fill"
        default: "fork.knife"
        }
    }

    private func action(
        _ label: String,
        _ symbol: String,
        _ type: InteractionType
    ) -> some View {
        Button {
            Task { await model.act(type) }
        } label: {
            Label(label, systemImage: symbol)
        }
        .buttonStyle(.bordered)
    }
}
