export module screeps:open_closed;
import std;

namespace screeps {

// Simple open-closed list
template <std::size_t Capacity>
class open_closed_t {
	public:
		[[nodiscard]] constexpr auto is_open(std::size_t index) const -> bool {
			return list[ index ] == marker;
		}

		[[nodiscard]] constexpr auto is_closed(std::size_t index) const -> bool {
			return list[ index ] == marker + 1;
		}

		constexpr auto clear() -> void {
			if (std::numeric_limits<value_type>::max() - 2 <= marker) {
				std::ranges::fill(list, 0);
				marker = 1;
			} else {
				marker += 2;
			}
		}

		constexpr auto close(std::size_t index) -> void {
			list[ index ] = marker + 1;
		}

		constexpr auto open(std::size_t index) -> void {
			list[ index ] = marker;
		}

	private:
		using value_type = unsigned;
		std::array<value_type, Capacity> list;
		value_type marker = 1;
};

}; // namespace screeps
