export module screeps:heap;
import std;

namespace screeps {

// Produces identical results to 'std::ranges::pop_heap'
template <class Type>
constexpr auto pop_heap(std::span<Type> container, auto compare, auto projection) {
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
template <class Type>
constexpr auto push_heap(std::span<Type> container, auto compare, auto projection) {
	for (auto ii = container.size(); ii != 1; ii /= 2) {
		if (compare(projection(container[ ii - 1 ]), projection(container[ (ii / 2) - 1 ]))) {
			break;
		} else {
			std::swap(container[ ii - 1 ], container[ (ii / 2) - 1 ]);
		}
	}
}

// Priority queue implementation w/ support for updating priorities
template <class Index, class Score, std::size_t Capacity, std::size_t Range>
class heap_t {
	public:
		using index_type = Index;
		using score_type = Score;
		using value_type = std::pair<index_type, score_type>;

		[[nodiscard]] constexpr auto empty() const -> bool { return size_ == 0; }
		[[nodiscard]] constexpr auto score(index_type index) const -> score_type { return score_[ index ]; }
		[[nodiscard]] constexpr auto top() const -> value_type { return {heap_[ 0 ], score_[ heap_[ 0 ] ]}; }
		constexpr auto clear() -> void { size_ = 0; }

		constexpr auto pop() -> void {
			pop_heap(range(), compare, projection());
			--size_;
		}

		constexpr auto push(value_type value) -> void {
			if (size_ == heap_.size()) {
				throw std::out_of_range{"max heap"};
			}
			score_[ value.first ] = value.second;
			heap_[ size_++ ] = value.first;
			push_heap(range(), compare, projection());
		}

		constexpr auto update(value_type value) -> void {
			// auto search = range() | std::views::enumerate | std::views::reverse;
			auto search = std::views::zip(std::views::iota(0UZ, size_), range()) | std::views::reverse;
			auto found = std::ranges::find(search, value.first, [](const auto& pair) { return get<1>(pair); });
			auto ii = static_cast<std::size_t>(get<0>(*found));
			score_[ value.first ] = value.second;
			push_heap(std::span{heap_.data(), ii + 1}, compare, projection());
		}

	private:
		constexpr static auto compare = std::greater{};

		constexpr auto projection() {
			return [ this ](index_type index) {
				return score_[ index ];
			};
		}

		// std::inplace_vector would be great for this
		constexpr auto range() -> std::span<index_type> { return std::span{heap_.begin(), size_}; }

		std::array<score_type, Capacity> score_;
		std::array<index_type, Range> heap_;
		std::size_t size_ = 0;
};

} // namespace screeps
