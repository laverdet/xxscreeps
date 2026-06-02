// Author: Marcel Laverdet <https://github.com/laverdet>
// macos:
// CXX=/opt/homebrew/Cellar/llvm/22.1.0/bin/clang++ cmake -DCMAKE_MODULE_PATH="$(pnpm exec auto_js_cmake_include)" -DCMAKE_CXX_STDLIB_MODULES_JSON=/opt/homebrew/opt/llvm/lib/c++/libc++.modules.json -G Ninja -B build && ninja -C build
// linux:
// CXX=clang++ cmake -DCMAKE_BUILD_TYPE=Debug -DCMAKE_MODULE_PATH="$(pnpm exec auto_js_cmake_include)" -G Ninja -B build; ninja -C build

// NODE_OPTIONS='--no-node-snapshot --experimental-vm-modules --enable-source-maps' lldb-22 node packages/xxscreeps/bin/xxscreeps.js test
#include "nan.h"
#include <auto_js/export_tag.h>
#include <isolated_vm.h>
import auto_js;
import screeps;
import std;
import util;
import v8_js;

namespace screeps {

// Init 2 Pathfinders per thread. We do 2 here because sometimes recursive calls to the path
// finder are useful. Any more than 2 deep recursion will have to allocate a new path finder at a
// cost of 2.16mb(!)
thread_local std::array<path_finder_t, 2> path_finders;

auto search(
	js::iv8::context_lock_witness lock,
	world_position_t origin,
	std::vector<heuristic_t::goal_t> goals,
	js::forward<v8::Local<v8::Value>> room_callback,
	// NOLINTNEXTLINE(bugprone-easily-swappable-parameters)
	int plain_cost,
	int swamp_cost,
	int max_rooms,
	int max_ops,
	unsigned max_cost,
	bool flee,
	double heuristic_weight
) -> std::optional<path_finder_t::result> {
	// Find an inactive path finder
	path_finder_t* pf = nullptr;
	std::unique_ptr<path_finder_t> pf_holder;
	for (auto& ii : path_finders) {
		if (!ii.is_in_use()) {
			pf = &ii;
			break;
		}
	}
	if (pf == nullptr) {
		pf_holder = std::make_unique<path_finder_t>();
		pf = pf_holder.get();
	}

	// Get the values from v8 and run the search
	return pf->search(
		origin,
		std::move(goals),
		room_callback->As<v8::Function>(),
		{
			.heuristic_weight = heuristic_weight,
			.plain_cost = plain_cost,
			.swamp_cost = swamp_cost,
			.max_ops = max_ops,
			.max_rooms = max_rooms,
			.max_cost = max_cost,
			.flee = flee,
		}
	);
}

auto load_terrain(js::forward<v8::Local<v8::Object>> world) -> void {
	path_finder_t::load_terrain(*world);
}

}; // namespace screeps

EXPORT ISOLATED_VM_MODULE void InitForContext(v8::Isolate* isolate, v8::Local<v8::Context> context, v8::Local<v8::Object> target) {
	auto isolate_witness = js::iv8::isolate_lock_witness::make_witness(isolate);
	auto context_witness = js::iv8::context_lock_witness::make_witness(isolate_witness, context);
	js::iv8::object_assign(
		context_witness,
		target,
		std::tuple{
			std::pair{util::cw<"search">, js::free_function{screeps::search}},
			std::pair{util::cw<"loadTerrain">, js::free_function{screeps::load_terrain}},
			std::pair{util::cw<"version">, 12},
		}
	);
}

void init(v8::Local<v8::Object> target) {
	v8::Isolate* isolate = v8::Isolate::GetCurrent();
	InitForContext(isolate, isolate->GetCurrentContext(), target);
}

#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wunused-parameter"
NAN_MODULE_WORKER_ENABLED(pf, init) // NOLINT
#pragma clang diagnostic pop
