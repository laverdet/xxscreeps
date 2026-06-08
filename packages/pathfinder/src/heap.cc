module;
#include <cassert>
export module screeps:heap;
import :utility;
import std;

namespace screeps {

// Produces identical results to 'std::ranges::pop_heap'
constexpr auto pop_heap(auto&& container, auto compare, auto projection) {
	std::swap(container.front(), container.back());
	auto size = container.size() - 1;
	auto vv = 1UZ;
	while (true) {
		auto uu = vv;
		if ((uu * 2) + 1 <= size) {
			if (!compare(projection(container[ (uu * 2) - 1 ]), projection(container[ uu - 1 ]))) {
				vv = uu * 2;
			}
			if (!compare(projection(container[ (uu * 2) ]), projection(container[ vv - 1 ]))) {
				vv = (uu * 2) + 1;
			}
		} else if (uu * 2 <= size) {
			if (!compare(projection(container[ (uu * 2) - 1 ]), projection(container[ uu - 1 ]))) {
				vv = uu * 2;
			}
		}
		if (uu != vv) {
			std::swap(container[ uu - 1 ], container[ vv - 1 ]);
		} else {
			break;
		}
	};
}

// Produces ~similar~ results to 'std::ranges::push_heap'. In some cases the std built-in produces
// shorter paths which is certainly worth looking into.
constexpr auto push_heap(auto&& container, auto compare, auto projection) {
	for (auto ii = container.size(); ii != 1; ii /= 2) {
		if (compare(projection(container[ ii - 1 ]), projection(container[ (ii / 2) - 1 ]))) {
			break;
		} else {
			std::swap(container[ ii - 1 ], container[ (ii / 2) - 1 ]);
		}
	}
}

// Storage for scores used as the projection type of `heap_t`
template <class Key, class Value, std::size_t Capacity>
class score_table_t {
	public:
		using key_type = Key;
		using value_type = Value;

		[[nodiscard]] constexpr auto operator()(key_type index) const -> value_type { return score_[ index ]; }
		constexpr auto operator[](key_type index) -> value_type& { return score_[ index ]; }

	private:
		std::array<Value, Capacity> score_;
};

// Priority queue implementation w/ support for updating priorities
template <class Type, class Compare, class Projection, std::size_t Capacity>
class heap_t : private Compare, private Projection {
	public:
		using value_type = Type;
		using key_compare = Compare;
		using key_project = Projection;

		explicit constexpr heap_t(key_compare&& compare = {}, key_project projection = {}) :
				key_compare{std::move(compare)},
				key_project{std::move(projection)} {}

		[[nodiscard]] constexpr auto empty() const -> bool { return heap_.empty(); }
		[[nodiscard]] constexpr auto key_comp() const -> const key_compare& { return *this; }
		[[nodiscard]] constexpr auto key_proj() const -> const key_project& { return *this; }
		[[nodiscard]] constexpr auto top() const -> value_type { return heap_[ 0 ]; }
		constexpr auto clear() -> void { heap_.clear(); }

		constexpr auto pop() -> void {
			pop_heap(heap_, std::cref(key_comp()), std::cref(key_proj()));
			heap_.pop_back();
		}

		constexpr auto push(value_type value, const auto& update) -> void {
			update(reinterpret_cast<key_project&>(*this));
			heap_.emplace_back(value);
			push_heap(heap_, std::cref(key_comp()), std::cref(key_proj()));
		}

		// nb: It only supports decreasing the score
		constexpr auto update(value_type value, const auto& update) -> void {
			// auto search = heap_ | std::views::enumerate | std::views::reverse;
			auto search = std::views::zip(std::views::iota(0UZ, heap_.size()), heap_) | std::views::reverse;
			auto found = std::ranges::find(search, value, [](const auto& pair) { return get<1>(pair); });
			auto ii = get<0>(*found);
			[[maybe_unused]] auto previous_score = key_proj()(value);
			update(reinterpret_cast<key_project&>(*this));
			assert(previous_score >= key_proj()(value));
			push_heap(std::ranges::subrange{heap_.begin(), heap_.begin() + ii + 1}, std::cref(key_comp()), std::cref(key_proj()));
		}

	private:
		inplace_vector<value_type, Capacity> heap_;
};

} // namespace screeps
