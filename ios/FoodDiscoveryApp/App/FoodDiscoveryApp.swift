import DiscoveryCore
import SwiftUI

@main
struct FoodDiscoveryApp: App {
    @StateObject private var model: AppModel

    init() {
        let configuredURL = Bundle.main.object(
            forInfoDictionaryKey: "FOOD_API_BASE_URL"
        ) as? String
        let baseURL = URL(
            string: configuredURL ?? "http://localhost:3000"
        )!
        _model = StateObject(
            wrappedValue: AppModel(api: FoodDiscoveryAPI(baseURL: baseURL))
        )
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .task { await model.load() }
        }
    }
}

private struct RootView: View {
    var body: some View {
        TabView {
            DiscoveryView()
                .tabItem {
                    Label("Discover", systemImage: "sparkles")
                }
            SavedView()
                .tabItem {
                    Label("Saved", systemImage: "heart")
                }
            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "slider.horizontal.3")
                }
        }
        .tint(.foodAccent)
    }
}
