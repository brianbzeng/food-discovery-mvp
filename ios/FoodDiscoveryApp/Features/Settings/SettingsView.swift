import DiscoveryCore
import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var model: AppModel
    @State private var allergens: Set<String> = []
    @State private var diets: Set<String> = []
    @State private var showUnknown = true

    private let allergenOptions = [
        "peanut", "tree_nut", "milk", "egg", "wheat",
        "soy", "sesame", "shellfish", "fish",
    ]
    private let dietOptions = [
        "vegetarian", "vegan", "gluten_free", "halal", "kosher",
    ]

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(
                        "Known conflicts are removed before ranking. Missing evidence is never represented as safe."
                    )
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                } header: {
                    Label("Safety boundary", systemImage: "shield.lefthalf.filled")
                }

                Section("Allergens") {
                    ForEach(allergenOptions, id: \.self) { option in
                        toggleRow(option, selection: $allergens)
                    }
                }

                Section("Dietary preferences") {
                    ForEach(dietOptions, id: \.self) { option in
                        toggleRow(option, selection: $diets)
                    }
                }

                Section {
                    Toggle(
                        "Show unknown evidence with a warning",
                        isOn: $showUnknown
                    )
                } footer: {
                    Text(
                        "For severe allergies, always confirm ingredients and cross-contact directly with the business."
                    )
                }

                Button("Save safety settings") {
                    Task {
                        await model.saveSettings(
                            allergens: allergens.sorted(),
                            dietaryRestrictions: diets.sorted(),
                            showUnknown: showUnknown
                        )
                    }
                }
            }
            .navigationTitle("Settings")
            .onAppear(perform: syncProfile)
            .onChange(of: model.profile?.version) {
                syncProfile()
            }
        }
    }

    private func toggleRow(
        _ option: String,
        selection: Binding<Set<String>>
    ) -> some View {
        Toggle(
            option.replacingOccurrences(of: "_", with: " ").capitalized,
            isOn: Binding(
                get: { selection.wrappedValue.contains(option) },
                set: { enabled in
                    if enabled {
                        selection.wrappedValue.insert(option)
                    } else {
                        selection.wrappedValue.remove(option)
                    }
                }
            )
        )
    }

    private func syncProfile() {
        guard let profile = model.profile else { return }
        allergens = Set(profile.allergens)
        diets = Set(profile.dietaryRestrictions)
        showUnknown = profile.showUnknownAllergyMatches
    }
}
