module;
#include <cassert>
export module screeps:open_closed;
import std;

namespace screeps {

// Type-erased view over `open_closed_t`
class open_closed_view {
	public:
		using value_type = unsigned;

		open_closed_view() = delete;
		explicit constexpr open_closed_view(value_type* list, value_type marker) :
				list_{list},
				marker_{marker} {}

		[[nodiscard]] constexpr auto is_closed(std::size_t index) const -> bool { return at(index) == marker_ + 1; }
		[[nodiscard]] constexpr auto is_open(std::size_t index) const -> bool { return at(index) == marker_; }
		constexpr auto close(std::size_t index) -> void { at(index) = marker_ + 1; }
		constexpr auto open(std::size_t index) -> void { at(index) = marker_; }

	private:
		// NOLINTNEXTLINE(cppcoreguidelines-pro-bounds-pointer-arithmetic)
		[[nodiscard]] constexpr auto at(std::size_t index) const -> value_type& { return list_[ index ]; }

		value_type* list_{};
		value_type marker_{};
};

// Simple open-closed list. Marker pairs are allocated to `open_closed_view` instances, which
// perform the actual list operations.
template <std::size_t Capacity>
class open_closed_t {
	public:
		using value_type = open_closed_view::value_type;

		constexpr auto clear_and_make_view() -> open_closed_view {
			auto view = open_closed_view{list_.data(), marker_};
			if (std::numeric_limits<value_type>::max() - k_width <= marker_) {
				std::ranges::fill(list_, 0);
				marker_ = 1;
			} else {
				marker_ += k_width;
			}
			return view;
		}

	private:
		constexpr static auto k_width = 2;
		std::array<value_type, Capacity> list_{};
		value_type marker_ = 1;
};

}; // namespace screeps
