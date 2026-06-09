#include <napi_js_initialize.h>
import auto_js;
import isolated_vm;
import napi_js;
import screeps;
import std;
import util;
using namespace screeps;
using namespace std::string_view_literals;
namespace napi = js::napi;

constexpr auto k_max_rooms = 64;

constexpr auto string_literals = std::tuple{
	"cost"sv,
	"incomplete"sv,
	"ops"sv,
	"path"sv,
	"pos"sv,
	"range"sv,
	"room"sv,
	"terrain"sv,
};

// napi environment (string table) and callback type
class environment
		: public napi::environment,
			public napi::string_table<string_literals> {
	public:
		using js::napi::environment::environment;
};

class napi_room_callback {
	public:
		napi_room_callback() = default;
		explicit napi_room_callback(napi::environment& env, napi::value_of<js::function_tag> maybe_room_callback) :
				env_{&env},
				maybe_room_callback{maybe_room_callback} {}

		auto operator()(room_location_t room) -> room_callback_result_type {
			if (maybe_room_callback) {
				return maybe_room_callback.call<room_callback_result_type>(*env_, room);
			} else {
				return std::monostate{};
			}
		}

	private:
		napi::environment* env_{};
		napi::value_of<js::function_tag> maybe_room_callback;
};

// @isolated-vm/experimental callback type
class isolated_vm_room_callback {
	public:
		isolated_vm_room_callback() = default;
		explicit isolated_vm_room_callback(const isolated_vm::runtime_lock& lock, isolated_vm::value_of<js::function_tag> maybe_room_callback) :
				lock_{&lock},
				maybe_room_callback{maybe_room_callback} {}

		auto operator()(room_location_t room) -> room_callback_result_type {
			if (maybe_room_callback) {
				return maybe_room_callback.call<room_callback_result_type>(*lock_, room);
			} else {
				return std::monostate{};
			}
		}

	private:
		const isolated_vm::runtime_lock* lock_{};
		isolated_vm::value_of<js::function_tag> maybe_room_callback;
};

auto check_termination() -> void {}

template <class Callback>
using pathfinder_stack_type =
	resource_recursion_stack<
		pathfinder<check_termination, Callback, k_max_rooms>,
		pathfinder<check_termination, Callback, 1>>;

template <class Callback>
pathfinder_stack_type<Callback> pathfinders;

template thread_local pathfinder_stack_type<napi_room_callback> pathfinders<napi_room_callback>;
template thread_local pathfinder_stack_type<isolated_vm_room_callback> pathfinders<isolated_vm_room_callback>;

template <class Lock, class Handle, class Callback>
auto search(
	Lock lock,
	world_position_t origin,
	std::vector<heuristic_t::goal_t> goals,
	std::optional<js::forward<Handle>> room_callback,
	// NOLINTNEXTLINE(bugprone-easily-swappable-parameters)
	int plain_cost,
	int swamp_cost,
	int max_rooms,
	int max_ops,
	int max_cost,
	bool flee,
	double heuristic_weight
) -> std::optional<result> {
	return pathfinders<Callback>(util::overloaded{
		[]() -> std::optional<result> { throw js::runtime_error{u"too many concurrent pathfinder searches"}; },
		[ & ](auto& pf) -> std::optional<result> {
			// Run the search
			return pf.search(
				Callback{lock, *room_callback.value_or({})},
				origin,
				std::move(goals),
				{
					.heuristic_weight = heuristic_weight,
					.plain_cost = plain_cost,
					.swamp_cost = swamp_cost,
					.max_cost = max_cost,
					.max_ops = max_ops,
					.max_rooms = max_rooms,
					.flee = flee,
				}
			);
		}
	});
}

// napi module
js::napi::napi_js_module module_namespace{
	std::type_identity<environment>{},
	[](auto& /*env*/) -> auto {
		return std::tuple{
			std::in_place,
			std::pair{util::cw<"loadTerrain">, js::free_function{load_terrain}},
			std::pair{util::cw<"search">, js::free_function{search<environment&, napi::value_of<js::function_tag>, napi_room_callback>}},
			std::pair{util::cw<"version">, 12},
		};
	}
};

// @isolated-vm/experimental addon
isolated_vm::addon sandbox_namespace{
	std::type_identity<std::monostate>{},
	[]() -> auto {
		return std::tuple{
			std::in_place,
			std::pair{util::cw<"search">, js::free_function{search<const isolated_vm::runtime_lock&, isolated_vm::value_of<js::function_tag>, isolated_vm_room_callback>}},
			std::pair{util::cw<"version">, 12},
		};
	}
};
