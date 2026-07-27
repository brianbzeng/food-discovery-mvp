import DiscoveryCore
import SwiftUI

struct PlaceDetailView: View {
    @EnvironmentObject private var model: AppModel
    let restaurantID: String
    @State private var place: RestaurantDetails?
    @State private var errorMessage: String?

    var body: some View {
        Group {
            if let place {
                List {
                    Section {
                        Label(
                            place.ownershipType == "independent"
                                ? "Independent local business"
                                : "Reviewed small local group",
                            systemImage: "checkmark.seal.fill"
                        )
                        Text(place.neighborhood)
                        if let address = formattedAddress(place.address) {
                            Text(address)
                        }
                    }

                    Section("Hours") {
                        ForEach(place.hours) { hours in
                            HStack {
                                Text(dayLabel(hours.dayOfWeek))
                                Spacer()
                                Text(
                                    hours.isClosed
                                        ? "Closed"
                                        : "\(hours.opensAt ?? "—")–\(hours.closesAt ?? "—")"
                                )
                                .foregroundStyle(.secondary)
                            }
                        }
                    }

                    Section("Safety evidence") {
                        if place.evidence.isEmpty {
                            Label(
                                "Restriction evidence is unknown",
                                systemImage: "exclamationmark.triangle.fill"
                            )
                        } else {
                            ForEach(place.evidence) { evidence in
                                VStack(alignment: .leading) {
                                    Text(evidence.restrictionKey.capitalized)
                                    Text(
                                        "\(evidence.status) · \(evidence.sourceType)"
                                    )
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                }
                            }
                        }
                        Text(
                            "Always confirm severe allergies directly with the business."
                        )
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    }

                    Section("Contact and handoff") {
                        link("View menu", place.menuUrl, "menucard")
                        link("Directions", place.directionsUrl, "map")
                        if let phone = place.phone,
                           let url = URL(string: "tel:\(phone)") {
                            Link(destination: url) {
                                Label("Call business", systemImage: "phone")
                            }
                        }
                    }
                }
                .navigationTitle(place.name)
                .navigationBarTitleDisplayMode(.large)
            } else if let errorMessage {
                ContentUnavailableView(
                    "Details unavailable",
                    systemImage: "wifi.exclamationmark",
                    description: Text(errorMessage)
                )
            } else {
                ProgressView("Loading details…")
            }
        }
        .task {
            do {
                place = try await model.api.restaurant(id: restaurantID)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    @ViewBuilder
    private func link(_ label: String, _ value: String?, _ symbol: String) -> some View {
        if let value, let url = URL(string: value) {
            Link(destination: url) {
                Label(label, systemImage: symbol)
            }
        }
    }

    private func formattedAddress(_ address: RestaurantAddress) -> String? {
        let components = [
            address.line1,
            address.city,
            address.region,
            address.postalCode,
        ].compactMap { $0 }
        return components.isEmpty ? nil : components.joined(separator: ", ")
    }

    private func dayLabel(_ value: Int) -> String {
        let labels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        return labels.indices.contains(value) ? labels[value] : "Day"
    }
}
