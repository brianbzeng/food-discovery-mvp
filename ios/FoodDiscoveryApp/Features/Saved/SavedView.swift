import DiscoveryCore
import SwiftUI

struct SavedView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        NavigationStack {
            Group {
                if model.savedPlaces.isEmpty {
                    ContentUnavailableView(
                        "Nothing saved yet",
                        systemImage: "heart",
                        description: Text(
                            "Save a local restaurant, café, or boba shop to build a shortlist."
                        )
                    )
                } else {
                    List(model.savedPlaces) { place in
                        NavigationLink {
                            PlaceDetailView(restaurantID: place.id)
                        } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(place.name)
                                    .font(.headline)
                                Text(
                                    "\(place.venueType.label) · \(place.neighborhood)"
                                )
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }
            }
            .navigationTitle("Saved")
            .refreshable {
                try? await model.reloadSaved()
            }
        }
    }
}
