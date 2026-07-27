import SwiftUI

extension Color {
    static let foodAccent = Color(
        red: 0.78,
        green: 0.96,
        blue: 0.25
    )
    static let foodCoral = Color(
        red: 0.98,
        green: 0.35,
        blue: 0.24
    )
}

struct LocalOnlyBanner: View {
    var body: some View {
        Label(
            "Independent and reviewed local businesses only",
            systemImage: "checkmark.seal.fill"
        )
        .font(.caption.weight(.semibold))
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color.foodAccent.opacity(0.3), in: .rect(cornerRadius: 14))
        .accessibilityHint(
            "Chains and franchises are removed before recommendations are ranked."
        )
    }
}
